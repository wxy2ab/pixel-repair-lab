"""Run the fixed vision workbench with OpenCV and local YOLOX-S."""

import json
from pathlib import Path
import runpy
import sys

import cv2 as cv
import numpy as np


ROOT = Path(__file__).resolve().parent
TOOLS = runpy.run_path(str(ROOT / 'runner.py'))
PHOTOS = {id_: ROOT / 'fixtures' / filename for id_, filename in (('labrador', 'labrador.jpg'), ('astronaut', 'astronaut.png'))}
MODEL_SIZE = 640
PALETTE = np.array([
    [[240, 30, 20], [20, 190, 45], [35, 65, 230], [245, 220, 30], [40, 190, 205], [175, 45, 180]],
    [[25, 25, 25], [90, 90, 90], [160, 160, 160], [235, 235, 235], [235, 130, 35], [95, 45, 170]],
    [[250, 100, 90], [25, 105, 55], [30, 55, 105], [220, 205, 175], [110, 190, 80], [70, 145, 225]],
    [[125, 80, 42], [38, 65, 75], [195, 210, 230], [240, 225, 238], [15, 115, 180], [212, 120, 156]],
], dtype=np.uint8)


def frame(id_, original, processed, include_images, extension='.jpg'):
    height, width = processed.shape[:2]
    settings = (cv.IMWRITE_JPEG_QUALITY, 84) if extension == '.jpg' else ()

    def encode(image):
        return TOOLS['image_data'](cv, image, extension, settings) if include_images else ''

    return {
        'id': id_, 'width': width, 'height': height, 'original': encode(original),
        'processed': encode(processed), 'detections': [],
    }


def inspect_palette(mode, params, include_images):
    x, y = params['x'], params['y']
    channel = params.get('channel', 'rgb')
    image = cv.cvtColor(PALETTE, cv.COLOR_RGB2BGR)
    sample = {'x': x, 'y': y, 'rgb': PALETTE[y, x].tolist()}
    code = f'image = cv.cvtColor(rgb_image, cv.COLOR_RGB2BGR)\npixel = rgb_image[{y}, {x}]  # row, column'
    processed = image
    if channel == 'gray':
        processed = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
        code += '\nchannel = cv.cvtColor(image, cv.COLOR_BGR2GRAY)'
    elif channel != 'rgb':
        index = {'blue': 0, 'green': 1, 'red': 2}[channel]
        processed = cv.extractChannel(image, index)
        code += f'\nchannel = cv.extractChannel(image, {index})  # {channel} in BGR order'
    if channel != 'rgb':
        sample['value'] = int(processed[y, x])
        code += f'\nvalue = channel[{y}, {x}]'
    return {
        'mode': mode, 'engine': f'OpenCV {cv.__version__}', 'code': code,
        'frames': [frame('calibration', image, processed, include_images, '.png')],
        'sample': sample, 'palette': PALETTE.tolist(), 'channel': channel,
    }


def filter_board(params, include_images):
    original = TOOLS['calibration_board'](cv, np)
    gray = cv.cvtColor(original, cv.COLOR_BGR2GRAY)
    code = 'gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)'
    blur = params['blur']
    if blur:
        gray = cv.GaussianBlur(gray, (blur, blur), 0)
        code += f'\ngray = cv.GaussianBlur(gray, ({blur}, {blur}), 0)'
    threshold = params['threshold']
    _, mask = cv.threshold(gray, threshold, 255, cv.THRESH_BINARY)
    components, _ = cv.connectedComponents(mask)
    code += f'\n_, mask = cv.threshold(gray, {threshold}, 255, cv.THRESH_BINARY)'
    code += '\nregions, _ = cv.connectedComponents(mask)\nregions -= 1  # exclude the background'
    result = frame('calibration', original, mask, include_images, '.png')
    if include_images:
        result['intermediate'] = TOOLS['image_data'](cv, gray, '.png')
    return {
        'mode': 'filter', 'engine': f'OpenCV {cv.__version__}', 'code': code,
        'frames': [result], 'regions': components - 1, 'whitePixels': cv.countNonZero(mask),
    }


def intersection_over_union(box, reference):
    x, y, w, h = box
    left, top, width, height = reference
    intersection_w = max(0, min(x + w, left + width) - max(x, left))
    intersection_h = max(0, min(y + h, top + height) - max(y, top))
    intersection = intersection_w * intersection_h
    union = w * h + width * height - intersection
    return intersection / union if union else 0.0


def prepare_image(original, side, tone):
    processed = TOOLS['resize_longest'](cv, original, side)
    if tone == 'brighten':
        processed = cv.convertScaleAbs(processed, alpha=1, beta=28)
    elif tone == 'gray':
        gray = cv.cvtColor(processed, cv.COLOR_BGR2GRAY)
        processed = cv.cvtColor(gray, cv.COLOR_GRAY2BGR)
    return processed


def annotate_boxes(result, params):
    width, height = result['width'], result['height']
    left, top = round(params['x'] * width / 100), round(params['y'] * height / 100)
    right = round((params['x'] + params['w']) * width / 100)
    bottom = round((params['y'] + params['h']) * height / 100)
    box = [left, top, right - left, bottom - top]
    top_detection = max(result['detections'], key=lambda item: item['score'], default=None)
    result['annotation'] = box
    result['iou'] = round(intersection_over_union(box, top_detection['box']), 4) if top_detection else 0


class Workbench:
    def __init__(self, include_images):
        self.include_images = include_images
        self.network = None
        self.photos = {}
        self.predictions = {}

    def photo(self, id_):
        if id_ not in self.photos:
            photo = cv.imread(str(PHOTOS[id_]))
            if photo is None:
                raise ValueError('Could not load classroom photo')
            self.photos[id_] = photo
        return self.photos[id_]

    def detect(self, key, image, confidence):
        if key not in self.predictions:
            if self.network is None:
                self.network = TOOLS['create_yolox_network'](cv)
            padded, width, height = TOOLS['yolox_input'](cv, np, image, MODEL_SIZE)
            prediction = TOOLS['predict_yolox'](self.network, padded)
            self.predictions[key] = (prediction, width, height)
        prediction, width, height = self.predictions[key]
        return TOOLS['map_yolox_detections'](cv, np, prediction, MODEL_SIZE, width, height, image.shape, confidence)

    def inspect_photo(self, mode, id_, params):
        image = TOOLS['resize_longest'](cv, self.photo(id_), MODEL_SIZE)
        result = frame(id_, image, image, self.include_images)
        confidence = 35 if mode == 'boxes' else params['confidence']
        target = params.get('target', 'all')
        detections = self.detect((id_, MODEL_SIZE, 'original'), image, confidence / 100)
        result['detections'] = [item for item in detections if target == 'all' or item['label'] == target]
        code = f'detections = detect_yolox(image, confidence={confidence / 100})'
        if target != 'all':
            code += f'\ndetections = [item for item in detections if item["label"] == {target!r}]'
        if mode == 'boxes':
            annotate_boxes(result, params)
            code += f'\nannotation = {result["annotation"]!r}  # x, y, width, height'
            code += '\noverlap = intersection_over_union(annotation, predicted_box)'
        return {'mode': mode, 'engine': f'YOLOX-S · OpenCV {cv.__version__}',
                'code': code, 'frames': [result], 'target': target}

    def project(self, params, action):
        side, tone = params['maxSide'], params['tone']
        code = f'prepared = resize_longest(cv, image, {side})'
        if tone == 'brighten':
            code += '\nprepared = cv.convertScaleAbs(prepared, alpha=1, beta=28)'
        elif tone == 'gray':
            code += '\ngray = cv.cvtColor(prepared, cv.COLOR_BGR2GRAY)\nprepared = cv.cvtColor(gray, cv.COLOR_GRAY2BGR)'
        confidence = params['confidence'] / 100
        if action == 'run':
            code += f'\ndetections = detect_yolox(prepared, confidence={confidence})'
        frames = []
        for id_ in PHOTOS:
            original = self.photo(id_)
            processed = prepare_image(original, side, tone)
            preview = TOOLS['resize_longest'](cv, original, MODEL_SIZE)
            result = frame(id_, preview, processed, self.include_images)
            if action == 'run':
                result['detections'] = self.detect((id_, side, tone), processed, confidence)
            frames.append(result)
        engine = f'OpenCV {cv.__version__}'
        if action == 'run':
            engine = 'YOLOX-S · ' + engine
        return {'mode': 'project', 'engine': engine, 'code': code,
                'frames': frames, 'preprocessing': {'maxSide': side, 'tone': tone}}

    def run(self, request):
        mode, params = request['mode'], request['params']
        if mode in ('pixels', 'color'):
            return inspect_palette(mode, params, self.include_images)
        if mode == 'filter':
            return filter_board(params, self.include_images)
        if mode == 'project':
            return self.project(params, request['action'])
        if mode in ('detect', 'boxes'):
            return self.inspect_photo(mode, request['image'], params)
        raise ValueError('Unknown vision course operation')


def attempt(workbench, request):
    try:
        return workbench.run(request)
    except (KeyError, ValueError, TypeError, IndexError, cv.error):
        return None


def main():
    cv.setNumThreads(2)
    if sys.argv[1:] == ['--batch']:
        workbench = Workbench(include_images=False)
        requests = json.loads(sys.stdin.buffer.read(128 * 1024))
        result = [attempt(workbench, request) for request in requests]
    else:
        workbench = Workbench(include_images=True)
        result = workbench.run(json.loads(sys.stdin.buffer.read(2048)))
    print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(',', ':')))


if __name__ == '__main__':
    main()
