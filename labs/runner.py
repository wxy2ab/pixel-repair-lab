"""Run one fixed classroom recipe with bounded parameters read from stdin."""

import base64
import importlib.util
import inspect
import json
from pathlib import Path
import sqlite3
import sys


ROOT = Path(__file__).resolve().parent
MODEL = ROOT / '.cache' / 'object_detection_yolox_2022nov.onnx'
PHOTO = ROOT / 'fixtures' / 'labrador.jpg'

BATTERY_LEVELS = [(1, 38), (2, 70), (3, 52), (4, 96), (5, 59), (6, 87), (7, 42), (8, 75)]
DELIVERIES = [
    ('hangar', 'battery', 4), ('workshop', 'sensor', 3), ('storage', 'battery', 6),
    ('hangar', 'cable', 2), ('workshop', 'battery', 7), ('storage', 'magnet', 2),
    ('storage', 'sensor', 1), ('hangar', 'magnet', 3),
]
READINGS = [
    (1, 'alpha', 17), (1, 'beta', 23), (1, 'gamma', 19),
    (2, 'alpha', 21), (2, 'beta', 25), (2, 'gamma', 18),
    (3, 'alpha', 22), (3, 'beta', 28), (3, 'gamma', 22),
    (4, 'alpha', 23), (4, 'beta', 29), (4, 'gamma', 20),
    (5, 'alpha', 27), (5, 'beta', 30), (5, 'gamma', 19),
]
SUPPLIES = [
    ('battery', 'hangar', 8), ('water', 'hangar', 2), ('wheel', 'hangar', 5),
    ('magnet', 'workshop', 7), ('sensor', 'workshop', 3), ('cable', 'storage', 10),
    ('glove', 'storage', 4),
]
CLASS_NAMES = (
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
    'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
    'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
    'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
    'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
    'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
    'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard',
    'cell phone', 'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
    'teddy bear', 'hair drier', 'toothbrush',
)


def integer(parameters, key, minimum, maximum):
    value = parameters.get(key)
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError('Invalid demo parameter')
    return value


def select_batteries(readings, minimum):
    import numpy as np

    table = np.asarray(readings)
    charge = table[:, 1]
    keep = charge >= minimum
    return table[keep]


def numpy_filter(parameters):
    import numpy as np

    minimum = integer(parameters, 'minimumCharge', 0, 100)
    rows = select_batteries(BATTERY_LEVELS, minimum).tolist()
    return {
        'recipe': 'numpy', 'engine': f'NumPy {np.__version__}', 'rows': rows, 'input': BATTERY_LEVELS,
        'code': inspect.getsource(select_batteries).strip() + f'\n\nselected = select_batteries(readings, minimum={minimum})',
    }


def group_deliveries(deliveries, group_by):
    import pandas as pd

    frame = pd.DataFrame(deliveries, columns=['zone', 'item', 'quantity'])
    return frame.groupby(group_by)['quantity'].agg(total='sum', deliveries='size').reset_index()


def pandas_group(parameters):
    import pandas as pd

    group_by = parameters.get('groupBy')
    if group_by not in ('zone', 'item'):
        raise ValueError('Invalid grouping column')
    summary = group_deliveries(DELIVERIES, group_by)
    return {
        'recipe': 'pandas', 'engine': f'pandas {pd.__version__}', 'groupBy': group_by,
        'rows': list(summary.itertuples(index=False, name=None)), 'input': DELIVERIES,
        'code': inspect.getsource(group_deliveries).strip() + f'\n\nsummary = group_deliveries(deliveries, group_by={group_by!r})',
    }


def summarize(readings, days):
    import numpy as np
    import pandas as pd

    frame = pd.DataFrame(readings, columns=['day', 'sector', 'temperature'])
    included = np.less_equal(frame['day'].to_numpy(), days)
    selected = frame.loc[included]
    temperatures = selected['temperature'].to_numpy()
    grouped = selected.groupby('sector')['temperature']
    averages = grouped.agg(average='mean', samples='size').round({'average': 1}).reset_index()
    return averages, float(np.median(temperatures)), int(np.ptp(temperatures))


def analysis(parameters):
    import numpy as np
    import pandas as pd

    days = integer(parameters, 'days', 1, 5)
    summary, median, spread = summarize(READINGS, days)
    rows = list(summary.itertuples(index=False, name=None))
    code = inspect.getsource(summarize).strip() + f'\n\nsummary, median, spread = summarize(readings, days={days})'
    return {
        'recipe': 'analysis', 'engine': f'NumPy {np.__version__} · pandas {pd.__version__}',
        'code': code, 'rows': rows, 'input': READINGS, 'summary': {'median': median, 'spread': spread},
    }


def query_supplies(connection, query, values):
    connection.execute('CREATE TABLE supplies(item TEXT, zone TEXT, stock INTEGER)')
    connection.executemany('INSERT INTO supplies VALUES (?, ?, ?)', SUPPLIES)
    return connection.execute(query, values).fetchall()


def sql(parameters):
    import duckdb

    minimum = integer(parameters, 'minimum', 0, 10)
    zone = parameters.get('zone')
    if zone not in ('all', 'hangar', 'workshop', 'storage'):
        raise ValueError('Invalid workshop')
    query = '''SELECT item, zone, stock
FROM supplies
WHERE stock >= ? AND (? = 'all' OR zone = ?)
ORDER BY stock DESC, item;'''
    connection = sqlite3.connect(':memory:')
    try:
        rows = query_supplies(connection, query, (minimum, zone, zone))
    finally:
        connection.close()
    with duckdb.connect(':memory:', config={'threads': 1, 'enable_external_access': 'false'}) as connection:
        duck_rows = query_supplies(connection, query, (minimum, zone, zone))
    return {
        'recipe': 'sql', 'engine': f'SQLite {sqlite3.sqlite_version} · DuckDB {duckdb.__version__}',
        'query': query, 'rows': rows, 'input': SUPPLIES, 'duckRows': duck_rows, 'comparisonMatches': rows == duck_rows,
    }


def image_data(cv, image, extension, parameters=()):
    ok, buffer = cv.imencode(extension, image, parameters)
    if not ok:
        raise RuntimeError('Could not encode demo image')
    mime = 'image/png' if extension == '.png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(buffer).decode('ascii')


def threshold_image(cv, image, threshold):
    gray = cv.cvtColor(image, cv.COLOR_BGR2GRAY)
    _, mask = cv.threshold(gray, threshold, 255, cv.THRESH_BINARY)
    components, _ = cv.connectedComponents(mask)
    return mask, components - 1, cv.countNonZero(mask)


def calibration_board(cv, np):
    image = np.full((220, 380, 3), (26, 32, 36), dtype=np.uint8)
    shapes = [(64, 64, 35, 78), (191, 57, 30, 122), (312, 74, 34, 178), (183, 160, 42, 228)]
    for x, y, radius, brightness in shapes:
        cv.circle(image, (x, y), radius, (brightness,) * 3, thickness=-1)
    return image


def opencv(parameters):
    import cv2 as cv
    import numpy as np

    threshold = integer(parameters, 'threshold', 40, 240)
    cv.setNumThreads(1)
    image = calibration_board(cv, np)
    mask, regions, pixels = threshold_image(cv, image, threshold)
    return {
        'recipe': 'opencv', 'engine': f'OpenCV {cv.__version__}', 'source': image_data(cv, image, '.png'),
        'image': image_data(cv, mask, '.png'), 'regions': regions, 'pixels': pixels,
        'code': inspect.getsource(threshold_image).strip(),
    }


def create_yolox_network(cv):
    network = cv.dnn.readNetFromONNX(str(MODEL))
    network.setPreferableBackend(cv.dnn.DNN_BACKEND_OPENCV)
    network.setPreferableTarget(cv.dnn.DNN_TARGET_CPU)
    return network


def predict_yolox(network, padded):
    network.setInput(padded.transpose(2, 0, 1)[None])
    return network.forward()[0]


def resize_longest(cv, image, size):
    height, width = image.shape[:2]
    scale = min(size / height, size / width)
    width, height = max(1, int(width * scale)), max(1, int(height * scale))
    return cv.resize(image, (width, height), interpolation=cv.INTER_LINEAR)


def yolox_input(cv, np, image, size):
    photo = resize_longest(cv, image, size)
    height, width = photo.shape[:2]
    padded = np.full((size, size, 3), 114, dtype=np.float32)
    padded[:height, :width] = cv.cvtColor(photo, cv.COLOR_BGR2RGB)
    return padded, width, height


def decode_yolox(cv, np, prediction, size, width, height, confidence):
    # Decode the grid offsets and use class-aware non-maximum suppression, per OpenCV Zoo YOLOX.
    rows = []
    strides = []
    for stride in (8, 16, 32):
        column, row = np.meshgrid(np.arange(size // stride), np.arange(size // stride))
        rows.append(np.column_stack((column.ravel(), row.ravel())))
        strides.append(np.full((column.size, 1), stride))
    grid_strides = np.concatenate(strides)
    center = (prediction[:, :2] + np.concatenate(rows)) * grid_strides
    sizes = np.exp(prediction[:, 2:4]) * grid_strides
    boxes = np.column_stack((center - sizes / 2, sizes))
    class_scores = prediction[:, 4:5] * prediction[:, 5:]
    classes = np.argmax(class_scores, axis=1)
    scores = np.max(class_scores, axis=1)
    keep = scores >= confidence
    boxes, scores, classes = boxes[keep], scores[keep], classes[keep]

    detections = []
    if scores.size:
        # The Boolean mask above already applies the lesson's inclusive threshold.
        picks = cv.dnn.NMSBoxesBatched(boxes.tolist(), scores.tolist(), classes.tolist(), 0.0, 0.5)
        for index in np.asarray(picks).reshape(-1)[:24]:
            x, y, w, h = boxes[index]
            left, top = max(0, round(x)), max(0, round(y))
            right, bottom = min(width, round(x + w)), min(height, round(y + h))
            if right > left and bottom > top:
                detections.append({
                    'label': CLASS_NAMES[classes[index]], 'score': round(float(scores[index]), 4),
                    'box': [left, top, right - left, bottom - top],
                })
    return detections


def map_yolox_detections(cv, np, prediction, size, width, height, image_shape, confidence):
    # Map detections from the 640-square tensor back to the caller's input image.
    detections = decode_yolox(cv, np, prediction, size, width, height, confidence)
    target_height, target_width = image_shape[:2]
    for detection in detections:
        x, y, w, h = detection['box']
        left, top = round(x * target_width / width), round(y * target_height / height)
        right = round((x + w) * target_width / width)
        bottom = round((y + h) * target_height / height)
        detection['box'] = [left, top, right - left, bottom - top]
    return [item for item in detections if item['box'][2] > 0 and item['box'][3] > 0]


def detect_yolox(cv, np, network, image, confidence):
    size = 640
    padded, width, height = yolox_input(cv, np, image, size)
    prediction = predict_yolox(network, padded)
    return map_yolox_detections(cv, np, prediction, size, width, height, image.shape, confidence)


def yolox(parameters):
    import cv2 as cv
    import numpy as np

    confidence = integer(parameters, 'confidence', 10, 95) / 100
    cv.setNumThreads(2)
    original = cv.imread(str(PHOTO))
    if original is None:
        raise RuntimeError('Could not load demo photograph')
    photo = resize_longest(cv, original, 640)
    height, width = photo.shape[:2]
    detections = detect_yolox(cv, np, create_yolox_network(cv), photo, confidence)
    return {
        'recipe': 'yolox', 'engine': f'YOLOX-S · OpenCV {cv.__version__}',
        'image': image_data(cv, photo, '.jpg'), 'width': width, 'height': height, 'detections': detections,
        'code': inspect.getsource(predict_yolox).strip(),
    }


RECIPES = {'numpy': numpy_filter, 'pandas': pandas_group, 'analysis': analysis, 'sql': sql, 'opencv': opencv, 'yolox': yolox}


def capabilities():
    numpy = importlib.util.find_spec('numpy') is not None
    pandas = numpy and importlib.util.find_spec('pandas') is not None
    cv = numpy and importlib.util.find_spec('cv2') is not None
    return {
        'numpy': numpy,
        'pandas': pandas,
        'analysis': pandas,
        'sql': importlib.util.find_spec('duckdb') is not None,
        'opencv': cv,
        'yolox': cv and PHOTO.is_file() and MODEL.is_file() and MODEL.stat().st_size == 35_858_002,
    }


if __name__ == '__main__':
    if sys.argv[1:] == ['--status']:
        print(json.dumps(capabilities()))
    else:
        request = json.loads(sys.stdin.buffer.read(2048))
        result = RECIPES[request['recipe']](request['parameters'])
        print(json.dumps(result, ensure_ascii=True, allow_nan=False, separators=(',', ':')))
