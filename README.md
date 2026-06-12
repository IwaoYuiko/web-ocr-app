# Offline Chinese OCR with Pinyin

A simple Chinese OCR tool that runs entirely in your web browser.

Convert images containing Chinese text into editable text and automatically display Pinyin pronunciation.

## Features

* 📷 OCR for Chinese text from images
* 🔤 Automatic Pinyin display
* 🔒 Fully offline — no image uploads
* ⚡ Runs directly in the browser
* 📋 Copy recognized text with one click
* 🆓 Free to use

## How to Use

1. Select an image (JPG or PNG)
2. Click **Run OCR**
3. View the recognized Chinese text
4. Check the Pinyin pronunciation below
5. Copy the text if needed

## Privacy

All processing happens locally in your browser.

Your images are **not uploaded to any server**.

## Screenshot

![Screenshot](images/screenshot.png)

## Technology

### OCR

* PP-OCRv5
* ONNX Runtime Web
* ppu-paddle-ocr

### Chinese Processing

* pinyin-pro

### Frontend

* React
* TypeScript
* Vite

## License

This project is released under the MIT License.

## Third-Party Components

This project uses PP-OCRv5 models from PaddleOCR.

PaddleOCR is licensed under the Apache License 2.0.

## Acknowledgements

This project is built with the help of the following open-source projects:

* PaddleOCR
* ONNX Runtime
* ppu-paddle-ocr
* pinyin-pro

Many thanks to the authors and contributors of these projects.
