"""Assemble the offline classroom Python framework before the release Mac signs it."""

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import plistlib
import re
import shutil
import stat
import struct
import tarfile
import tempfile
import zipfile


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def verified_wheels(portable):
    hashes = [digest(portable / 'python.tar.gz')]
    wheels = []
    for line in (portable / 'requirements.lock').read_text().splitlines():
        match = re.fullmatch(r'([\w.]+)==([\w.]+) --hash=sha256:([\da-f]{64})', line)
        if not match:
            raise ValueError('Invalid laboratory wheel lock entry: ' + line)
        name, version, expected = match.groups()
        candidates = list((portable / 'wheels').glob(f'{name}-{version}-*.whl'))
        if len(candidates) != 1 or digest(candidates[0]) != expected:
            raise ValueError(f'Missing or damaged laboratory wheel for {name} {version}')
        wheels.append(candidates[0])
        hashes.append(expected)
    revision = hashlib.sha256('\n'.join(hashes).encode()).hexdigest()
    if not wheels or revision != (portable / 'revision').read_text().strip():
        raise ValueError('The laboratory interpreter and wheel lock do not match their revision')
    return wheels


def archive_path(name):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError('Invalid archive member: ' + name)
    return path


def write_member(source, path, executable=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as output:
        shutil.copyfileobj(source, output)
    path.chmod(0o755 if executable else 0o644)


def unpack_python(archive, version, arch):
    stdlib = ('python', 'lib', 'python3.12')
    excluded = {'site-packages', 'ensurepip', 'tkinter', 'idlelib', '__pycache__'}
    with tarfile.open(archive, 'r|gz') as package:
        for member in package:
            if not member.isfile():
                continue
            path = archive_path(member.name)
            if path.as_posix() == 'python/bin/python3.12':
                target = version / 'bin/python3.12'
            elif path.as_posix() == 'python/lib/libpython3.12.dylib':
                target = version / 'ClassroomPython'
            elif path.parts[:3] == stdlib and not excluded.intersection(path.parts[3:]):
                if path.suffix in {'.pyc', '.a', '.exe'} or path.name.startswith('_tkinter.'):
                    continue
                target = version.joinpath(*path.parts[1:])
            else:
                continue
            with package.extractfile(member) as source:
                write_member(source, target, member.mode & 0o111)

    # The locked PBS installers ship thin 64-bit little-endian Mach-O binaries.
    for binary in (version / 'bin/python3.12', version / 'ClassroomPython'):
        with binary.open('rb') as source:
            magic, cpu = struct.unpack('<II', source.read(8))
        cpus = {'arm64': 0x0100000C, 'x86_64': 0x01000007}
        if magic != 0xFEEDFACF or cpu not in cpus.values() or (arch and cpu != cpus[arch]):
            raise ValueError(f'{binary.name} is not the expected macOS {arch or "64-bit"} binary')
    (version / 'lib/libpython3.12.dylib').symlink_to('../ClassroomPython')


def install_wheel(wheel, site_packages):
    # All currently locked wheels install at platlib/purelib (one site-packages here).
    # Reject future wheel schemes that need a script launcher or another installation path.
    with zipfile.ZipFile(wheel) as archive:
        for member in archive.infolist():
            path = archive_path(member.filename)
            if member.is_dir():
                continue
            mode = member.external_attr >> 16
            if not path.parts or path.parts[0].endswith('.data') or stat.S_ISLNK(mode):
                raise ValueError(f'Unsupported wheel member in {wheel.name}: {member.filename}')
            with archive.open(member) as source:
                write_member(source, site_packages.joinpath(*path.parts), mode & 0o111)


def assemble(labs, app, arch):
    portable = labs / 'portable'
    wheels = verified_wheels(portable)
    contents = app / 'Contents'
    framework = contents / 'Frameworks/ClassroomPython.framework'
    resources = contents / 'Resources/game/labs'
    if framework.exists() or resources.exists():
        raise ValueError('Prepare the labs in a fresh app staging directory')
    framework.parent.mkdir(parents=True, exist_ok=True)
    resources.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=contents) as temp:
        root = Path(temp)
        prepared = root / framework.name
        version = prepared / 'Versions/A'
        unpack_python(portable / 'python.tar.gz', version, arch)
        for wheel in wheels:
            install_wheel(wheel, version / 'lib/python3.12/site-packages')
        (version / 'Resources').mkdir()
        with (version / 'Resources/Info.plist').open('wb') as output:
            plistlib.dump(dict(CFBundleIdentifier='org.pixelrepairlab.ClassroomPython',
                               CFBundleExecutable='ClassroomPython', CFBundleName='ClassroomPython',
                               CFBundlePackageType='FMWK', CFBundleVersion='3.12',
                               CFBundleShortVersionString='3.12',
                               CFBundleInfoDictionaryVersion='6.0'), output)
        (prepared / 'Versions/Current').symlink_to('A')
        for name in ('ClassroomPython', 'Resources'):
            (prepared / name).symlink_to('Versions/Current/' + name)

        data = root / 'labs'
        model = json.loads((labs / 'yolox-model.json').read_text())
        model_name = model['name']
        if Path(model_name).name != model_name or digest(labs / '.cache' / model_name) != model['sha256']:
            raise ValueError('The classroom YOLOX model is missing or damaged')
        files = ['runner.py', 'data_course.py', 'vision_course.py', 'YOLOX-LICENSE.txt',
                 'fixtures/astronaut.png', 'fixtures/labrador.jpg', 'fixtures/station-readings.json',
                 'yolox-model.json', '.cache/' + model_name]
        for name in files:
            (data / name).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(labs / name, data / name)
        prepared.rename(framework)
        data.rename(resources)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('labs', type=Path, help='Prepared payload/game/labs in the release kit')
    parser.add_argument('app', type=Path, help='Fresh unsigned .app in the release staging directory')
    parser.add_argument('--arch', choices=('arm64', 'x86_64'))
    args = parser.parse_args()
    assemble(args.labs, args.app, args.arch)
