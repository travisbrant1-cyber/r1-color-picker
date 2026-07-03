(function () {
  'use strict';

  var cameraView = document.getElementById('cameraView');
  var resultView = document.getElementById('resultView');
  var pantoneView = document.getElementById('pantoneView');
  var camPreview = document.getElementById('camPreview');
  var camFallback = document.getElementById('camFallback');
  var fileInput = document.getElementById('fileInput');
  var captureBtn = document.getElementById('captureBtn');
  var statusDot = document.getElementById('statusDot');

  var photoCanvas = document.getElementById('photoCanvas');
  var swatchStrip = document.getElementById('swatchStrip');
  var colorPreview = document.getElementById('colorPreview');
  var hexValue = document.getElementById('hexValue');
  var rgbValue = document.getElementById('rgbValue');
  var hslValue = document.getElementById('hslValue');

  var hueSlider = document.getElementById('hueSlider');
  var satSlider = document.getElementById('satSlider');
  var valSlider = document.getElementById('valSlider');
  var hueOut = document.getElementById('hueOut');
  var satOut = document.getElementById('satOut');
  var valOut = document.getElementById('valOut');

  var pantoneBtn = document.getElementById('pantoneBtn');
  var pantoneBackBtn = document.getElementById('pantoneBackBtn');
  var pantoneSwatch = document.getElementById('pantoneSwatch');
  var pantoneText = document.getElementById('pantoneText');

  var currentView = 'camera';
  var videoActive = false;
  var swatches = [];
  var selectedSwatchIndex = 0;
  var currentHSV = { h: 0, s: 0, v: 0 };
  var pantoneTimeout = null;

  // ---- Color math ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    var h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    var s = max === 0 ? 0 : d / max;
    return { h: h, s: s * 100, v: max * 100 };
  }

  function hsvToRgb(h, s, v) {
    s /= 100; v /= 100;
    var c = v * s;
    var x = c * (1 - Math.abs((h / 60) % 2 - 1));
    var m = v - c;
    var r, g, b;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  // ---- View switching ----
  function showView(name) {
    currentView = name;
    cameraView.classList.toggle('active', name === 'camera');
    resultView.classList.toggle('active', name === 'result');
    pantoneView.classList.toggle('active', name === 'pantone');
  }

  // ---- Camera ----
  function initCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback();
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(function (stream) {
        camPreview.srcObject = stream;
        camPreview.classList.add('active');
        camFallback.style.display = 'none';
        videoActive = true;
        statusDot.classList.add('live');
      })
      .catch(function () {
        showFallback();
      });
  }

  function showFallback() {
    videoActive = false;
    camFallback.style.display = 'block';
    statusDot.classList.add('sim');
  }

  function drawSourceToCanvas(source, sw, sh) {
    var ctx = photoCanvas.getContext('2d');
    var cw = photoCanvas.width, ch = photoCanvas.height;
    var srcRatio = sw / sh, dstRatio = cw / ch;
    var sx, sy, sWidth, sHeight;
    if (srcRatio > dstRatio) {
      sHeight = sh; sWidth = sh * dstRatio; sx = (sw - sWidth) / 2; sy = 0;
    } else {
      sWidth = sw; sHeight = sw / dstRatio; sx = 0; sy = (sh - sHeight) / 2;
    }
    ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, cw, ch);
  }

  function captureFromVideo() {
    if (!videoActive) return;
    drawSourceToCanvas(camPreview, camPreview.videoWidth, camPreview.videoHeight);
    onPhotoCaptured();
  }

  function requestCapture() {
    if (videoActive) captureFromVideo();
    else fileInput.click();
  }

  fileInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var img = new Image();
    img.onload = function () {
      drawSourceToCanvas(img, img.naturalWidth, img.naturalHeight);
      onPhotoCaptured();
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
  });

  captureBtn.addEventListener('click', requestCapture);
  camFallback.addEventListener('click', function () { fileInput.click(); });

  // ---- Dominant color extraction ----
  function extractDominantColors(count) {
    var ctx = photoCanvas.getContext('2d');
    var imgData = ctx.getImageData(0, 0, photoCanvas.width, photoCanvas.height).data;
    var buckets = {};
    for (var i = 0; i < imgData.length; i += 4) {
      var r = imgData[i], g = imgData[i + 1], b = imgData[i + 2], a = imgData[i + 3];
      if (a < 200) continue;
      var key = Math.round(r / 32) + ',' + Math.round(g / 32) + ',' + Math.round(b / 32);
      if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
      buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].n++;
    }
    var arr = Object.keys(buckets).map(function (k) {
      var bucket = buckets[k];
      return { r: Math.round(bucket.r / bucket.n), g: Math.round(bucket.g / bucket.n), b: Math.round(bucket.b / bucket.n), n: bucket.n };
    });
    arr.sort(function (a, b) { return b.n - a.n; });
    return arr.slice(0, count);
  }

  function onPhotoCaptured() {
    swatches = extractDominantColors(6);
    renderSwatchStrip();
    if (swatches.length) selectSwatch(0);
    else setColorFromRGB({ r: 128, g: 128, b: 128 });
    showView('result');
  }

  function renderSwatchStrip() {
    swatchStrip.innerHTML = '';
    swatches.forEach(function (sw, i) {
      var div = document.createElement('div');
      div.className = 'swatch';
      div.style.background = 'rgb(' + sw.r + ',' + sw.g + ',' + sw.b + ')';
      div.addEventListener('click', function () { selectSwatch(i); });
      swatchStrip.appendChild(div);
    });
  }

  function selectSwatch(i) {
    if (!swatches.length) return;
    selectedSwatchIndex = ((i % swatches.length) + swatches.length) % swatches.length;
    var children = swatchStrip.children;
    for (var j = 0; j < children.length; j++) children[j].classList.toggle('selected', j === selectedSwatchIndex);
    setColorFromRGB(swatches[selectedSwatchIndex]);
  }

  function cycleSwatch(delta) {
    selectSwatch(selectedSwatchIndex + delta);
  }

  photoCanvas.addEventListener('click', function (e) {
    var rect = photoCanvas.getBoundingClientRect();
    var x = clamp(Math.floor((e.clientX - rect.left) * (photoCanvas.width / rect.width)), 0, photoCanvas.width - 1);
    var y = clamp(Math.floor((e.clientY - rect.top) * (photoCanvas.height / rect.height)), 0, photoCanvas.height - 1);
    var pixel = photoCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
    setColorFromRGB({ r: pixel[0], g: pixel[1], b: pixel[2] });
    var children = swatchStrip.children;
    for (var j = 0; j < children.length; j++) children[j].classList.remove('selected');
  });

  // ---- Sliders / color state ----
  function setColorFromRGB(rgb) {
    currentHSV = rgbToHsv(rgb.r, rgb.g, rgb.b);
    syncSlidersToState();
    updateDisplay();
  }

  function syncSlidersToState() {
    hueSlider.value = Math.round(currentHSV.h);
    satSlider.value = Math.round(currentHSV.s);
    valSlider.value = Math.round(currentHSV.v);
    hueOut.textContent = hueSlider.value;
    satOut.textContent = satSlider.value;
    valOut.textContent = valSlider.value;
  }

  function updateDisplay() {
    var rgb = hsvToRgb(currentHSV.h, currentHSV.s, currentHSV.v);
    var hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    var hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
    colorPreview.style.background = hex;
    hexValue.textContent = hex.toUpperCase();
    rgbValue.textContent = rgb.r + ', ' + rgb.g + ', ' + rgb.b;
    hslValue.textContent = hsl.h + '°, ' + hsl.s + '%, ' + hsl.l + '%';
  }

  hueSlider.addEventListener('input', function () {
    currentHSV.h = Number(hueSlider.value);
    hueOut.textContent = hueSlider.value;
    updateDisplay();
  });
  satSlider.addEventListener('input', function () {
    currentHSV.s = Number(satSlider.value);
    satOut.textContent = satSlider.value;
    updateDisplay();
  });
  valSlider.addEventListener('input', function () {
    currentHSV.v = Number(valSlider.value);
    valOut.textContent = valSlider.value;
    updateDisplay();
  });

  // ---- Pantone (approximate, LLM best-guess) ----
  var pantoneStillThinkingTimeout = null;

  function extractJsonObject(text) {
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) {}
    var match = text.match(/\{[^{}]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (e) {}
    }
    return null;
  }

  function requestPantone() {
    pantoneSwatch.style.background = hexValue.textContent;
    showView('pantone');

    if (typeof PluginMessageHandler === 'undefined') {
      pantoneText.textContent = 'Needs the on-device LLM — try this on your R1.';
      return;
    }
    pantoneText.textContent = 'Looking up…';
    clearTimeout(pantoneTimeout);
    clearTimeout(pantoneStillThinkingTimeout);

    pantoneStillThinkingTimeout = setTimeout(function () {
      pantoneText.textContent = 'Still thinking…';
    }, 8000);
    pantoneTimeout = setTimeout(function () {
      pantoneText.textContent = 'No response — try again.';
    }, 30000);

    PluginMessageHandler.postMessage(JSON.stringify({
      message: 'This is a fun approximation game, not an official lookup. For the color ' + hexValue.textContent + ', make your best informal guess at the closest common paint or Pantone-style color name people might call it, plus a made-up-sounding approximate code for fun. Reply with just this JSON, nothing else: {"pantoneName":"<name>","pantoneCode":"<code>"}',
      useLLM: true
    }));
  }

  window.onPluginMessage = function (data) {
    clearTimeout(pantoneTimeout);
    clearTimeout(pantoneStillThinkingTimeout);
    var parsed = null;
    if (data) {
      parsed = extractJsonObject(data.data) || extractJsonObject(data.message);
    }
    if (parsed && parsed.pantoneName) {
      pantoneText.textContent = parsed.pantoneName + (parsed.pantoneCode ? ' (' + parsed.pantoneCode + ')' : '') + ' — approx.';
    } else if (data && (data.message || data.data)) {
      pantoneText.textContent = String(data.message || data.data).slice(0, 160) + ' — approx.';
    } else {
      pantoneText.textContent = 'Could not parse a match.';
    }
  };

  pantoneBtn.addEventListener('click', requestPantone);
  pantoneBackBtn.addEventListener('click', function () { showView('result'); });

  // ---- Hardware events ----
  window.addEventListener('sideClick', function () {
    if (currentView === 'camera') requestCapture();
  });
  window.addEventListener('longPressStart', function () {
    if (currentView === 'pantone') showView('result');
    else if (currentView === 'result') showView('camera');
  });
  window.addEventListener('scrollUp', function () {
    if (currentView === 'result') cycleSwatch(-1);
  });
  window.addEventListener('scrollDown', function () {
    if (currentView === 'result') cycleSwatch(1);
  });

  initCamera();
})();
