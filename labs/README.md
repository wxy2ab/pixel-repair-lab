# 本地课堂演示 · Local classroom demos

在项目目录运行 `npm run labs:setup`。需要 64 位 Python 3.11、3.12 或 3.13，以及首次安装时的网络。安装完成后启动游戏或刷新页面，即可在 NumPy、pandas、统计分析、数据库、OpenCV 和 YOLOX 单元本地运行实验。运行期间没有网络依赖。

Run `npm run labs:setup` from the project folder using 64-bit Python 3.11, 3.12 or 3.13. Setup needs an internet connection. After setup, start or reload the game to run experiments in NumPy, pandas, Statistics, Databases, OpenCV, and YOLOX. The experiments run offline with the provisioned files.

- `labs/.venv` stores pinned DuckDB, NumPy, pandas, and headless OpenCV packages. SQLite comes with Python.
- `labs/.cache` stores the SHA-256-verified YOLOX model. Setup downloads it from the OpenCV Zoo upstream. The app runs inference on the CPU.
- `npm run test:labs` uses the local Python environment and model to verify all six recipes, each exercise goal, and the HTTP interface.

NumPy filters battery readings with a Boolean mask. pandas groups shipment records by area or item. Statistics compares means, median, and range across sensor readings. The database demo compares the same parameterized query in in-memory SQLite and DuckDB. OpenCV counts bright regions after thresholding. YOLOX displays detection boxes at the selected confidence threshold. The exercises check counts observed in these results, using the same bundled inputs and fixed recipe controls.

数据科学课程在 [`data_course.py`](data_course.py) 运行固定的数据操作，原始传感器日志位于 [`fixtures/station-readings.json`](fixtures/station-readings.json)。浏览器提交选择的参数，实验返回实际执行片段及每一步的输入和输出。结课项目使用 NumPy、pandas 和内存 SQLite，后续步骤直接读取前一步的结果。

The data science course runs fixed operations in [`data_course.py`](data_course.py) on the sensor log in [`fixtures/station-readings.json`](fixtures/station-readings.json). The browser submits selected settings and receives the executed snippet, input, and output for each step. The final project uses NumPy, pandas, and in-memory SQLite, passing each result to the next operation.

计算机视觉课程在 [`vision_course.py`](vision_course.py) 运行固定图像实验。合成校准图用于检查像素、通道与阈值。照片实验在本机使用 YOLOX-S。结课项目把同一组照片用 OpenCV 预处理，再把处理后的像素送入模型。

The computer vision course in [`vision_course.py`](vision_course.py) uses generated calibration images for pixels, channels and thresholding. The photo experiments run YOLOX-S locally. The final project feeds the two photos into the model after OpenCV preprocessing.

## Sources and attribution

- YOLOX-S ONNX model and reference detection algorithm from the [Apache-2.0 OpenCV Zoo YOLOX model directory](https://github.com/opencv/opencv_zoo/tree/main/models/object_detection_yolox). Model identifier `object_detection_yolox_2022nov.onnx`, SHA-256 `c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063`.
- `fixtures/labrador.jpg` is [YellowLabradorLooking new.jpg](https://commons.wikimedia.org/wiki/File:YellowLabradorLooking_new.jpg), photo by Elf with retouching by Djmirko and FT2, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The byte-identical file is mirrored by [TensorFlow’s sample assets](https://storage.googleapis.com/download.tensorflow.org/example_images/YellowLabradorLooking_new.jpg). The demo resizes the photo and draws detection overlays. The photo and resized view remain under CC BY-SA 3.0.
- `fixtures/astronaut.png` is the public-domain NASA photo of Eileen Collins distributed with [scikit-image's astronaut sample](https://scikit-image.org/docs/0.25.x/api/skimage.data.html#skimage.data.astronaut). The [v0.25.2 source asset](https://github.com/scikit-image/scikit-image/blob/v0.25.2/skimage/data/astronaut.png) is included byte-for-byte. The workbench resizes and adjusts the photo for its experiments.
- The calibration board and tabular data sets were created for this project.
