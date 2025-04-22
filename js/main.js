// 检查浏览器是否支持getUserMedia
async function setupCamera() {
    // 检查是否在安全上下文中运行
    if (!window.isSecureContext) {
        throw new Error(
            '摄像头访问需要安全上下文(HTTPS或localhost)。' +
            '请使用HTTPS或localhost访问此页面。'
        );
    }

    // 处理不同浏览器的getUserMedia
    const getUserMedia = navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia;

    if (getUserMedia) {
        navigator.mediaDevices = navigator.mediaDevices || {};
        navigator.mediaDevices.getUserMedia = function (constraints) {
            return new Promise((resolve, reject) => {
                getUserMedia.call(navigator, constraints, resolve, reject);
            });
        };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
            '浏览器不支持getUserMedia。\n' +
            '请确保：\n' +
            '1. 使用最新版本的Chrome、Firefox、Safari或Edge浏览器\n' +
            '2. 通过HTTPS或localhost访问\n' +
            '3. 已授予摄像头访问权限'
        );
    }

    try {
        // 尝试访问摄像头
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: { ideal: 'environment' }
            },
            audio: false
        });

        const video = document.getElementById('videoElement');
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.style.display = 'block';
                resolve(video);
            };
        });
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            throw new Error('摄像头访问被拒绝。请允许浏览器访问摄像头。');
        } else if (err.name === 'NotFoundError') {
            throw new Error('未找到摄像头设备。请确保设备已连接。');
        } else if (err.name === 'NotReadableError') {
            throw new Error('摄像头可能被其他应用程序占用。请关闭其他使用摄像头的应用。');
        } else {
            throw new Error(`摄像头访问失败: ${err.message}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const video = document.getElementById('videoElement');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const ctx = cameraCanvas.getContext('2d');
    const loader = document.getElementById('loader');
    const resultsList = document.getElementById('resultsList');

    cameraCanvas.width = 800;
    cameraCanvas.height = 400;

    // // 检查并设置WebGPU后端
    // const backendName = 'webgpu';
    // try {
    //     if (!tf.findBackend(backendName)) {
    //         await tf.registerBackend(backendName);
    //     }
    //     await tf.setBackend(backendName);
    //     await tf.ready();
    //     console.log('当前TensorFlow后端:', tf.getBackend());

    //     // 设置WebGPU特定配置
    //     const webgpuFlags = {
    //         'WEBGPU_CPU_FORWARD': false,  // 禁用CPU fallback
    //         'WEBGPU_USE_IMPORT': true,    // 启用导入优化
    //         'WEBGPU_DEFERRED_SUBMIT': true // 启用延迟提交
    //     };

    //     for (const [flag, value] of Object.entries(webgpuFlags)) {
    //         tf.env().set(flag, value);
    //     }
    // } catch (error) {
    //     console.warn('WebGPU初始化失败，回退到WebGL:', error);
    //     await tf.setBackend('webgl');
    //     await tf.ready();
    //     console.log('当前TensorFlow后端:', tf.getBackend());
    // }

    loader.style.display = 'flex';
    loader.querySelector('p').textContent = '正在加载模型...';

    // 初始化检测器
    console.log("开始导入yoloDetector实例");
    const detector = new YoloDetector();

    await new Promise(resolve => {
        const checkInit = () => {
            if (detector.initialized) {
                resolve();
                loader.style.display = 'none';
            } else {
                setTimeout(checkInit, 100);
            }
        };
        checkInit();
    });

    // 加载模板图像
    const templatePath = 'templates/000001.jpg';
    const template = new Image();
    template.src = templatePath;
    template.onload = async () => {
        const isGotten = await detector.getTemplate(template);
        if (isGotten === 0) {
            console.log('模板特征获取成功');
        } else {
            console.error('模板特征获取失败');
        }
    };

    // 初始化摄像头
    try {
        await setupCamera();
        console.log('摄像头初始化成功');
    } catch (error) {
        console.error(error.message);
        const errorDiv = document.createElement('div');
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '20px';
        errorDiv.style.textAlign = 'center';
        errorDiv.textContent = error.message;
        document.querySelector('.content').prepend(errorDiv);
        return;
    }

    let lastFrameTime = 0;
    const minFrameTime = 1000 / 1000; // 限制最大帧率为10fps

    async function detectFrame(timestamp) {
        // 控制帧率
        if (timestamp - lastFrameTime < minFrameTime) {
            requestAnimationFrame(detectFrame);
            return;
        } else {
            // 输出实时帧率
            const fps = 1000 / (timestamp - lastFrameTime);
            console.log(`当前帧率: ${fps.toFixed(2)} fps`);
        }
        lastFrameTime = timestamp;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

            try {
                const result = await detector.detect(cameraCanvas);

                // 清除上一帧
                ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
                ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

                // 绘制检测结果
                result.forEach(detection => {
                    const x = detection.x * cameraCanvas.width;
                    const y = detection.y * cameraCanvas.height;
                    const w = detection.width * cameraCanvas.width;
                    const h = detection.height * cameraCanvas.height;

                    // 绘制边界框
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x - w / 2, y - h / 2, w, h);

                    // 绘制标签
                    // ctx.fillStyle = '#00ff00';
                    // ctx.font = '16px Arial';
                    // ctx.fillText(detection.class, x - w / 2, y - h / 2 - 5);
                });

                // 更新检测结果显示
                updateResultsList(result);
            } catch (error) {
                console.error('检测过程发生错误:', error);
            }

            if (tf.memory().numTensors > 100) {  // 降低阈值
                tf.disposeVariables();
                await tf.nextFrame();  // 等待下一帧before继续
            }
        }

        requestAnimationFrame(detectFrame);
    }

    // 更新结果列表
    function updateResultsList(result) {
        resultsList.innerHTML = '';
        result.forEach(detection => {
            const item = document.createElement('div');
            item.className = 'detection-item';
            item.innerHTML = `
                <p>位置：x=${detection.x.toFixed(3)}, y=${detection.y.toFixed(3)}</p>
                <p>尺寸：w=${detection.width.toFixed(3)}, h=${detection.height.toFixed(3)}</p>
                <p>类别：${detection.class}</p>
            `;
            resultsList.appendChild(item);
        });
    }

    video.addEventListener('loadeddata', () => {
        detectFrame();
    });
});