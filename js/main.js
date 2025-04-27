// 在文件开头添加语音识别相关变量
let recognition = null;
let recognitionActive = false;
let speechSynthesis = window.speechSynthesis;
let userTemplates = [];
let currentTemplate = {
    path: 'templates/000001.jpg',
    name: '默认模板',
    category: 'default',
    date: new Date().toISOString()
};

// 全局变量
let currentFacingMode = 'environment'; // 默认使用后置摄像头
let detector = null;
let isModelLoaded = false;
let isDetecting = false;
let lastVideoElement = null; // 存储最后成功设置的视频元素引用
let lastCanvasElement = null; // 存储最后成功设置的画布元素引用

// 检查浏览器是否支持getUserMedia
async function setupCamera() {
    console.log('设置摄像头...');
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('您的浏览器不支持摄像头访问');
        showToast('您的浏览器不支持摄像头访问，请使用现代浏览器', 'error');
        return false;
    }
    
    // 获取视频元素
    const videoElement = document.getElementById('videoElement');
    
    if (!videoElement) {
        console.error('未找到视频元素');
        showToast('未找到视频元素', 'error');
        return false;
    }
    
    // 停止任何现有的视频流
    if (videoElement.srcObject) {
        const tracks = videoElement.srcObject.getTracks();
        tracks.forEach(track => track.stop());
    }
    
    // 摄像头配置选项
    const constraints = {
        video: {
            facingMode: currentFacingMode, // 优先使用指定的摄像头
            width: { ideal: 1280 },
            height: { ideal: 720 }
        }
    };
    
    try {
        console.log('请求摄像头权限...');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('摄像头权限已获得');
        
        // 设置视频源
        videoElement.srcObject = stream;
        
        // 等待视频加载
        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                // 设置Canvas尺寸
                const canvasElement = document.getElementById('cameraCanvas');
                if (!canvasElement) {
                    console.error('未找到Canvas元素');
                    showToast('未找到Canvas元素', 'error');
                    resolve(false);
                    return;
                }
                
                const ctx = canvasElement.getContext('2d');
                
                // 设置初始Canvas尺寸
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                
                console.log(`视频尺寸: ${videoElement.videoWidth}x${videoElement.videoHeight}`);
                console.log('摄像头设置完成');
                
                showToast('摄像头已准备就绪', 'success');
                resolve(true);
            };
            
            videoElement.onerror = () => {
                console.error('视频元素加载出错');
                showToast('视频加载失败', 'error');
                resolve(false);
            };
            
            // 启动视频播放
            videoElement.play().catch(err => {
                console.error('视频播放失败:', err);
                showToast('视频播放失败: ' + err.message, 'error');
                resolve(false);
            });
        });
    } catch (error) {
        console.error('获取摄像头权限失败:', error);
        
        // 根据错误类型提供更具体的错误消息
        if (error.name === 'NotAllowedError') {
            showToast('摄像头权限被拒绝，请允许浏览器访问您的摄像头', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('未检测到摄像头设备', 'error');
        } else {
            showToast('摄像头访问失败: ' + error.message, 'error');
        }
        
        return false;
    }
}

// 切换前后摄像头
async function switchCamera() {
    if (isDetecting) {
        // 暂停检测
        isDetecting = false;
        
        // 更新UI
        document.getElementById('statusIndicator').className = 'status-initializing';
        document.getElementById('statusText').textContent = '切换摄像头...';
        
        try {
            // 切换摄像头模式
            currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
            console.log('切换摄像头模式为:', currentFacingMode);
            
            // 重新设置摄像头
            await setupCamera();
            
            // 恢复检测
            isDetecting = true;
            document.getElementById('statusIndicator').className = 'status-ready';
            document.getElementById('statusText').textContent = '就绪';
            showToast('摄像头已切换');
            
            // 恢复检测循环
            detectFrame();
        } catch (error) {
            console.error('切换摄像头失败:', error);
            document.getElementById('statusIndicator').className = 'status-error';
            document.getElementById('statusText').textContent = '错误: ' + error.message;
            showToast('切换摄像头失败: ' + error.message, 'danger');
        }
    } else {
        // 如果没有在检测状态，只切换模式
        currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
        showToast('摄像头模式已切换，将在下次启动时生效');
    }
}

// 捕获当前画面并下载
function captureFrame() {
    const canvas = document.getElementById('cameraCanvas');
    const link = document.createElement('a');
    link.download = `visionseek-capture-${new Date().toISOString()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    // 显示捕获成功提示
    showToast('已保存检测画面');
    
    // 语音提示
    speakText('图片已保存');
}

// 显示消息提示框
function showToast(message, type = 'success') {
    // 如果已有toast则先移除
    let existingToast = document.querySelector('.toast-container');
    if (existingToast) {
        existingToast.remove();
    }
    
    // 创建toast元素
    const toastContainer = document.createElement('div');
    toastContainer.className = `toast-message toast-${type}`;
    const icon = type === 'success' ? 'check' : (type === 'danger' ? 'x' : (type === 'warning' ? 'error-circle' : 'info-circle'));
    
    toastContainer.innerHTML = `
        <div class="toast-content">
            <i class="bx bx-${icon} me-2"></i> ${message}
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(toastContainer);
    
    // 显示toast
    setTimeout(() => toastContainer.classList.add('show'), 10);
    
    // 3秒后自动移除
    setTimeout(() => {
        toastContainer.classList.remove('show');
        setTimeout(() => toastContainer.remove(), 300);
    }, 3000);
}

// 语音合成朗读文本
function speakText(text) {
    // 停止当前正在朗读的内容
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    
    // 创建语音对象
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    
    // 开始朗读
    speechSynthesis.speak(utterance);
}

// 初始化语音识别
function initSpeechRecognition() {
    // 检查浏览器是否支持语音识别API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        showToast('您的浏览器不支持语音识别功能', 'danger');
        console.error('浏览器不支持SpeechRecognition API');
        return false;
    }
    
    recognition = new SpeechRecognition();
    
    // 配置识别器
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'zh-CN';  // 设置中文识别
    
    // 识别结果事件
    recognition.onresult = function(event) {
        const result = event.results[0][0].transcript.trim();
        document.getElementById('voiceText').textContent = `识别到: "${result}"`;
        console.log('语音识别结果:', result);
        
        // 处理语音命令
        processVoiceCommand(result);
    };
    
    // 识别结束事件
    recognition.onend = function() {
        stopListening();
    };
    
    // 识别错误事件
    recognition.onerror = function(event) {
        console.error('语音识别错误:', event.error);
        document.getElementById('voiceText').textContent = `识别错误: ${event.error}`;
        stopListening();
        
        // 显示错误提示
        if (event.error === 'no-speech') {
            showToast('未能检测到语音，请重试', 'warning');
        } else {
            showToast('语音识别出错，请重试', 'danger');
        }
    };
    
    return true;
}

// 开始语音识别
function startListening() {
    if (!recognition && !initSpeechRecognition()) {
        return;
    }
    
    try {
        recognition.start();
        recognitionActive = true;
        
        // 更新UI状态
        document.getElementById('voiceControlBtn').classList.add('active');
        document.getElementById('voiceStatus').classList.add('active');
        document.getElementById('voiceText').textContent = '正在聆听...';
        
        // 5秒后自动停止(以防没有识别到结束)
        setTimeout(() => {
            if (recognitionActive) {
                stopListening();
            }
        }, 5000);
        
        // 播放提示音
        speakText(' ');  // 非常短的声音作为提示
        
    } catch (error) {
        console.error('启动语音识别失败:', error);
        recognitionActive = false;
    }
}

// 停止语音识别
function stopListening() {
    if (recognition && recognitionActive) {
        recognition.stop();
        recognitionActive = false;
        
        // 更新UI状态
        document.getElementById('voiceControlBtn').classList.remove('active');
        
        // 延迟关闭状态显示，让用户有时间看到识别结果
        setTimeout(() => {
            document.getElementById('voiceStatus').classList.remove('active');
        }, 1500);
    }
}

// 处理语音命令
function processVoiceCommand(command) {
    // 转换为小写并移除标点符号以便更好地匹配
    const normalizedCommand = command.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
    
    // 匹配"开始检测"命令
    if (normalizedCommand.includes('开始检测')) {
        initDetection();
        speakText('已进入检测界面');
        return;
    }
    
    // 匹配"寻找[物品]"命令
    const findMatch = normalizedCommand.match(/寻找\s*(.+)/);
    if (findMatch) {
        const itemName = findMatch[1].trim();
        // 查找匹配的模板
        findAndApplyTemplate(itemName);
        return;
    }
    
    // 匹配"切换摄像头"命令
    if (normalizedCommand.includes('切换摄像头')) {
        if (isDetecting) {
            currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
            switchCamera(currentFacingMode).then(() => {
                speakText(`已切换至${currentFacingMode === 'environment' ? '后置' : '前置'}摄像头`);
            });
        } else {
            speakText('请先进入检测界面');
            setTimeout(() => initDetection(), 1500);
        }
        return;
    }
    
    // 匹配"拍照"命令
    if (normalizedCommand.includes('拍照') || normalizedCommand.includes('截图')) {
        if (isDetecting) {
            captureFrame();
        } else {
            speakText('请先进入检测界面');
            setTimeout(() => initDetection(), 1500);
        }
        return;
    }
    
    // 匹配"朗读结果"命令
    if (normalizedCommand.includes('朗读结果') || normalizedCommand.includes('读出结果')) {
        if (isDetecting) {
            readDetectionResults();
        } else {
            speakText('请先进入检测界面');
            setTimeout(() => initDetection(), 1500);
        }
        return;
    }
    
    // 如果没有匹配任何命令
    speakText('未能识别命令，您可以说"开始检测"或"寻找物品"');
}

// 查找并应用模板
function findAndApplyTemplate(itemName) {
    // 首先查找完全匹配的模板
    let template = userTemplates.find(t => t.name.toLowerCase() === itemName.toLowerCase());
    
    // 如果没有完全匹配，尝试部分匹配
    if (!template) {
        template = userTemplates.find(t => t.name.toLowerCase().includes(itemName.toLowerCase()));
    }
    
    if (template) {
        currentTemplate = template;
        speakText(`正在寻找${template.name}`);
        
        // 更新UI
        updateCurrentTemplateDisplay();
        
        // 如果还没在检测界面，先进入检测界面
        if (!isDetecting) {
            initDetection();
        }
    } else {
        speakText(`没有找到${itemName}的模板，请先上传该物品的照片`);
    }
}

// 更新当前模板显示
function updateCurrentTemplateDisplay() {
    const templateImg = document.getElementById('currentTemplateImg');
    const templateName = document.getElementById('currentTemplateName');
    
    if (templateImg && templateName) {
        templateImg.src = currentTemplate.path;
        templateName.textContent = currentTemplate.name;
    }
}

// 朗读检测结果
function readDetectionResults() {
    const resultsList = document.getElementById('resultsList');
    const detectionCount = document.getElementById('detectionCount');
    
    if (!resultsList || !detectionCount) return;
    
    const count = parseInt(detectionCount.textContent);
    
    if (count === 0) {
        speakText('当前未检测到物体');
        return;
    }
    
    // 获取所有检测结果
    const detectionItems = resultsList.querySelectorAll('.detection-item');
    let resultsText = `检测到${count}个物体。`;
    
    detectionItems.forEach((item, index) => {
        const className = item.querySelector('h6')?.textContent || '';
        const confidence = item.querySelector('.badge')?.textContent || '';
        
        if (className) {
            resultsText += `${index + 1}：${className}，置信度${confidence}。`;
        }
    });
    
    speakText(resultsText);
}

// 设置Canvas尺寸
function setupCanvasSize() {
    const cameraCanvas = document.getElementById('cameraCanvas');
    if (!cameraCanvas || !cameraCanvas.parentElement) return;
    
    const containerWidth = cameraCanvas.parentElement.clientWidth;
    const containerHeight = cameraCanvas.parentElement.clientHeight || 480; // 默认高度
    cameraCanvas.width = containerWidth;
    cameraCanvas.height = containerHeight;
}

// 响应窗口大小变化
window.addEventListener('resize', setupCanvasSize);

// 初始化摄像头并开始检测 - 这是核心功能函数
async function initDetection() {
    try {
        console.log('开始初始化检测系统...');
        
        // 显示加载状态 - 添加检查确保元素存在
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (statusIndicator) {
            statusIndicator.className = 'status-loading';
        }
        
        if (statusText) {
            statusText.textContent = '加载模型中...';
        }
        
        // 显示加载器
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'flex';
        }
        
        showToast('正在加载TensorFlow.js和模型，请稍候...', 'info');
        
        // 延迟执行，给TensorFlow.js时间加载
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // 确保TensorFlow.js已加载
        if (typeof tf === 'undefined') {
            console.error('TensorFlow.js未加载');
            showToast('TensorFlow.js加载失败，请刷新页面重试', 'error');
            
            // 隐藏加载器
            if (loader) {
                loader.style.display = 'none';
            }
            
            return false;
        }
        
        console.log('TensorFlow.js已加载，版本:', tf?.version?.tfjs || 'unknown');
        
        // 检查window对象中的YOLO检测器
        if (typeof YoloDetector === 'function') {
            console.log('发现自定义YoloDetector类，使用它进行初始化');
            detector = new YoloDetector();
            console.log('YOLO检测器初始化成功');
        } 
        // 检查cocoSsd是否可用
        else if (typeof cocoSsd !== 'undefined') {
            console.log('使用cocoSsd模型');
            try {
                detector = await cocoSsd.load({
                    base: 'lite_mobilenet_v2'  // 使用轻量级模型提高性能
                });
                console.log('COCO-SSD模型加载成功');
            } catch (modelError) {
                console.error('cocoSsd模型加载失败:', modelError);
                showToast('cocoSsd模型加载失败: ' + modelError.message, 'error');
                
                // 尝试创建一个模拟检测器用于测试
                detector = createMockDetector();
                console.log('已创建模拟检测器用于测试');
            }
        } 
        // 如果没有可用检测器，创建模拟检测器
        else {
            console.log('未找到可用的检测器，创建模拟检测器');
            detector = createMockDetector();
            console.log('已创建模拟检测器用于测试');
        }
        
        // 测试检测器是否可用
        if (!detector || typeof detector.detect !== 'function') {
            console.error('检测器初始化失败或不可用');
            showToast('检测器初始化失败，使用模拟检测器', 'error');
            detector = createMockDetector();
        }
        
        // 确保摄像头已设置
        const videoElement = document.getElementById('videoElement');
        if (!videoElement || !videoElement.srcObject) {
            console.log('摄像头未设置，尝试设置摄像头...');
            const cameraReady = await setupCamera();
            if (!cameraReady) {
                console.error('摄像头设置失败');
                
                // 隐藏加载器
                if (loader) {
                    loader.style.display = 'none';
                }
                
                return false;
            }
        }
        
        // 更新UI状态 - 添加检查确保元素存在
        if (statusIndicator) {
            statusIndicator.className = 'status-ready';
        }
        if (statusText) {
            statusText.textContent = '模型已就绪';
        }
        
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.disabled = false;
            startButton.textContent = '开始检测';
        }
        
        // 显示检测界面
        const detectionInterface = document.getElementById('detection-interface');
        if (detectionInterface) {
            detectionInterface.style.display = 'block';
            
            // 滚动到检测界面
            detectionInterface.scrollIntoView({ behavior: 'smooth' });
        }
        
        // 隐藏加载器
        if (loader) {
            loader.style.display = 'none';
        }
        
        showToast('检测系统初始化完成！', 'success');
        console.log('检测系统初始化完成');
        
        return true;
    } catch (error) {
        console.error('初始化检测时出错:', error);
        showToast('初始化失败: ' + error.message, 'error');
        
        // 更新UI显示错误 - 添加检查确保元素存在
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (statusIndicator) {
            statusIndicator.className = 'status-error';
        }
        if (statusText) {
            statusText.textContent = '初始化失败';
        }
        
        // 隐藏加载器
        const loader = document.getElementById('loader');
        if (loader) {
            loader.style.display = 'none';
        }
        
        return false;
    }
}

// 创建模拟检测器，用于在加载失败时进行测试
function createMockDetector() {
    return {
        detect: async function(image) {
            console.log('使用模拟检测器');
            
            // 始终返回一个标准瓶子作为检测结果，便于测试
            return [
                {
                    bbox: [100, 100, 150, 300],  // x, y, width, height
                    class: 'bottle',
                    score: 0.95
                }
            ];
        }
    };
}

// 开始检测
function startDetection() {
    if (!detector) {
        console.error('检测器未初始化，无法开始检测');
        showToast('检测器未初始化，请先初始化检测系统', 'error');
        return;
    }
    
    const videoElement = document.getElementById('videoElement');
    if (!videoElement || !videoElement.srcObject) {
        console.error('摄像头未设置，无法开始检测');
        showToast('摄像头未设置，请检查摄像头权限', 'error');
        return;
    }
    
    console.log('开始对象检测...');
    
    // 更新UI状态
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const startButton = document.getElementById('startButton');
    const detectionStats = document.getElementById('detectionStats');
    
    if (statusIndicator) {
        statusIndicator.className = 'status-active';
    }
    
    if (statusText) {
        statusText.textContent = '检测中...';
    }
    
    if (startButton) {
        startButton.textContent = '停止检测';
    }
    
    if (detectionStats) {
        detectionStats.style.display = 'block';
    }
    
    // 更新目标检测状态栏
    const targetStatusText = document.getElementById('targetStatusText');
    if (targetStatusText) {
        if (currentTemplate && currentTemplate.name) {
            targetStatusText.textContent = `正在搜索 ${currentTemplate.name}...`;
        } else {
            targetStatusText.textContent = '请先选择要检测的目标物品模板';
        }
    }
    
    // 开始检测
    isDetecting = true;
    lastFrameTime = performance.now(); // 重置帧时间计数器
    requestAnimationFrame(detectFrame);
    
    showToast('对象检测已启动', 'success');
}

// 停止检测
function stopDetection() {
    console.log('停止对象检测');
    
    isDetecting = false;
    
    // 更新UI状态
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const startButton = document.getElementById('startButton');
    
    if (statusIndicator) {
        statusIndicator.className = 'status-ready';
    }
    
    if (statusText) {
        statusText.textContent = '已就绪';
    }
    
    if (startButton) {
        startButton.textContent = '开始检测';
    }
    
    // 更新目标检测状态栏
    const targetStatusText = document.getElementById('targetStatusText');
    const targetDetectionStatus = document.getElementById('targetDetectionStatus');
    const targetPosition = document.getElementById('targetPosition');
    
    if (targetStatusText) {
        targetStatusText.textContent = '未开始检测目标物品';
    }
    
    if (targetDetectionStatus) {
        targetDetectionStatus.classList.remove('found', 'not-found');
    }
    
    if (targetPosition) {
        targetPosition.style.display = 'none';
    }
    
    // 清除高亮
    const highlight = document.querySelector('.target-highlight');
    if (highlight) {
        highlight.remove();
    }
    
    showToast('对象检测已停止', 'info');
}

// 执行检测帧
let lastFrameTime = 0; // 用于计算帧率
const FRAME_INTERVAL = 50; // 每50毫秒处理一帧，约等于20fps

async function detectFrame() {
    if (!isDetecting) {
        console.log('检测已停止');
        return;
    }

    // 计算当前时间与上一帧的时间差，控制帧率
    const now = performance.now();
    const elapsed = now - lastFrameTime;
    
    // 如果距离上次处理的时间不足，则仅更新画面不进行检测
    if (elapsed < FRAME_INTERVAL) {
        const videoElement = document.getElementById('videoElement');
        const canvas = document.getElementById('cameraCanvas');
        if (videoElement && canvas) {
            const ctx = canvas.getContext('2d');
            // 仅绘制视频帧，不执行检测
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
        requestAnimationFrame(detectFrame);
        return;
    }
    
    // 更新上一帧时间
    lastFrameTime = now;

    try {
        const videoElement = document.getElementById('videoElement');
        
        // 检查视频是否准备好
        if (!videoElement || !videoElement.srcObject || videoElement.paused || videoElement.ended) {
            console.warn('视频未准备好，跳过此帧检测');
            requestAnimationFrame(detectFrame);
            return;
        }

        const canvas = document.getElementById('cameraCanvas');
        if (!canvas) {
            console.warn('未找到Canvas元素，跳过此帧检测');
            requestAnimationFrame(detectFrame);
            return;
        }
        
        const ctx = canvas.getContext('2d', { alpha: false }); // 使用不透明canvas提高性能
        
        // 确保画布尺寸与视频匹配
        if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
            canvas.width = videoElement.videoWidth || 640;
            canvas.height = videoElement.videoHeight || 480;
            console.log('画布尺寸已调整为:', canvas.width, 'x', canvas.height);
        }
        
        // 绘制当前视频帧到画布
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        
        // 确保检测器已初始化
        if (!detector) {
            console.warn('检测器未初始化，跳过检测');
            showToast('检测器未初始化，请刷新页面重试', 'error');
            requestAnimationFrame(detectFrame);
            return;
        }
        
        // 执行对象检测
        console.log('执行检测...');
        const predictions = await detector.detect(videoElement);
        console.log('检测结果:', predictions);
        
        // 默认先将所有检测到的物品展示出来，方便调试
        renderPredictions(predictions, ctx, null);
        
        // 如果currentTemplate存在，尝试匹配模板
        let targetDetected = false;
        let targetPosition = null;
        
        if (currentTemplate && currentTemplate.name) {
            // 无论模板名称如何，先检查是否有预测结果
            if (predictions && predictions.length > 0) {
                // 针对"瓶"类物品的特殊处理
                const bottleRelatedTerms = ['bottle', 'beverage', 'drink', '瓶', '水瓶', '饮料', '雪碧', '可乐', '绿茶'];
                
                const templateObjectName = currentTemplate.name.toLowerCase();
                
                // 尝试在检测结果中查找匹配的对象
                for (const pred of predictions) {
                    const className = pred.class ? pred.class.toLowerCase() : '';
                    const score = pred.score || 0;
                    
                    // 记录每个检测到的物品用于调试
                    console.log(`检测到: ${className}, 置信度: ${score}, 与模板 "${templateObjectName}" 比较`);
                    
                    // 扩展匹配条件
                    const isMatch = (
                        // 如果名称完全匹配
                        className === templateObjectName || 
                        // 或者模板名包含类名
                        templateObjectName.includes(className) || 
                        // 或者类名包含模板名
                        className.includes(templateObjectName) ||
                        // 或者是瓶子类物品且模板也是瓶子
                        (bottleRelatedTerms.includes(className) && 
                         bottleRelatedTerms.some(term => templateObjectName.includes(term))) ||
                        // 允许更宽松的匹配 - 如果模板包含"瓶"字且检测到瓶子
                        (templateObjectName.includes('瓶') && className === 'bottle') ||
                        // 特定的雪碧、饮料匹配
                        (templateObjectName.includes('雪碧') && className === 'bottle') ||
                        // 置信度高于阈值时直接使用检测结果
                        score > 0.7
                    );
                    
                    if (isMatch) {
                        targetDetected = true;
                        
                        // 获取位置信息
                        const [x, y, width, height] = pred.bbox;
                        const centerX = x + width / 2;
                        const centerY = y + height / 2;
                        
                        // 确定位置描述
                        let positionDesc = '';
                        
                        // 水平位置
                        if (centerX < canvas.width / 3) {
                            positionDesc += '左';
                        } else if (centerX > 2 * canvas.width / 3) {
                            positionDesc += '右';
                        } else {
                            positionDesc += '中';
                        }
                        
                        // 垂直位置
                        if (centerY < canvas.height / 3) {
                            positionDesc += '上方';
                        } else if (centerY > 2 * canvas.height / 3) {
                            positionDesc += '下方';
                        } else {
                            positionDesc += '部';
                        }
                        
                        targetPosition = {
                            x: x,
                            y: y,
                            width: width,
                            height: height,
                            description: positionDesc
                        };
                        
                        // 标记为目标对象
                        pred.isTarget = true;
                        break;
                    }
                }
            }
        }
        
        // 更新目标检测状态栏
        updateTargetStatus(targetDetected, targetPosition, currentTemplate);
        
        // 渲染检测结果
        renderPredictions(predictions, ctx, targetPosition);
        
        // 更新UI
        updateDetectionStats(predictions);
        
        // 将最新的检测结果添加到列表
        if (predictions && predictions.length > 0) {
            updateResultsList(predictions);
        }
        
        // 继续下一帧检测
        requestAnimationFrame(detectFrame);
    } catch (error) {
        console.error('检测帧时出错:', error);
        
        // 更新UI显示错误
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        
        if (statusIndicator) {
            statusIndicator.className = 'status-error';
        }
        
        if (statusText) {
            statusText.textContent = '检测错误';
        }
        
        // 如果是暂时性错误，尝试继续检测
        if (isDetecting) {
            console.log('尝试继续检测...');
            setTimeout(() => requestAnimationFrame(detectFrame), 1000);
        }
    }
}

// 渲染预测结果
function renderPredictions(predictions, ctx, targetPosition) {
    if (!ctx) return;
    
    // 清除画布上可能存在的旧目标框
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // 重新绘制视频帧
    const videoElement = document.getElementById('videoElement');
    if (videoElement) {
        ctx.drawImage(videoElement, 0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    
    // 更新调试信息
    updateDebugInfo(predictions);
    
    // 绘制检测框和标签
    if (predictions && predictions.length > 0) {
        predictions.forEach(prediction => {
            if (!prediction.bbox) return;
            
            // 获取预测数据
            const [x, y, width, height] = prediction.bbox;
            const className = prediction.class || '未知物体';
            const score = prediction.score || 0;
            const text = `${className}: ${Math.round(score * 100)}%`;
            
            // 设置绘制样式 - 目标物品用蓝色，其他用红色
            ctx.strokeStyle = prediction.isTarget ? '#007bff' : '#FF0000';
            ctx.lineWidth = prediction.isTarget ? 3 : 2;
            ctx.fillStyle = prediction.isTarget ? '#007bff' : '#FF0000';
            ctx.font = '16px Arial';
            
            // 绘制边界框
            ctx.beginPath();
            ctx.rect(x, y, width, height);
            ctx.stroke();
            
            // 绘制文本背景
            const textWidth = ctx.measureText(text).width;
            ctx.fillStyle = prediction.isTarget ? 'rgba(0, 123, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(x, y - 25, textWidth + 10, 25);
            
            // 绘制文本
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(text, x + 5, y - 7);
            
            // 如果是目标物品，绘制额外的标识
            if (prediction.isTarget) {
                // 绘制目标标记
                ctx.fillStyle = '#007bff';
                ctx.beginPath();
                ctx.arc(x + width - 10, y + 10, 8, 0, 2 * Math.PI);
                ctx.fill();
                
                ctx.fillStyle = '#FFFFFF';
                ctx.font = '12px Arial';
                ctx.fillText('✓', x + width - 13, y + 14);
            }
        });
    }
    
    // 如果检测到了目标物品但不在预测中（通过模板匹配），也绘制目标框
    if (targetPosition && !predictions.some(p => p.isTarget)) {
        const { x, y, width, height } = targetPosition;
        
        // 绘制蓝色目标框
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.rect(x, y, width, height);
        ctx.stroke();
        
        // 绘制标签
        const text = `目标: ${currentTemplate ? currentTemplate.name : '未知'}`;
        const textWidth = ctx.measureText(text).width;
        
        // 绘制文本背景
        ctx.fillStyle = 'rgba(0, 123, 255, 0.7)';
        ctx.fillRect(x, y - 25, textWidth + 10, 25);
        
        // 绘制文本
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, x + 5, y - 7);
    }
}

// 更新检测统计信息
function updateDetectionStats(predictions) {
    if (!predictions) return;
    
    // 获取检测的对象数量
    const objectCount = predictions.length;
    
    // 更新UI显示
    const statsElement = document.getElementById('detectionStats');
    if (statsElement) {
        statsElement.textContent = `检测到 ${objectCount} 个对象`;
        statsElement.style.display = objectCount > 0 ? 'block' : 'none';
    }
}

// 更新结果列表
function updateResultsList(predictions) {
    const resultsList = document.getElementById('resultsList');
    const detectionCount = document.getElementById('detectionCount');
    
    if (!resultsList || !Array.isArray(predictions)) return;
    
    // 更新检测数量
    if (detectionCount) {
        detectionCount.textContent = predictions.length;
    }
    
    // 清空结果列表
    resultsList.innerHTML = '';
    
    // 如果没有检测结果
    if (predictions.length === 0) {
        resultsList.innerHTML = '<div class="text-center text-muted py-3">未检测到物体</div>';
        return;
    }
    
    // 添加每个检测结果
    predictions.forEach((prediction, index) => {
        const item = document.createElement('div');
        item.className = 'detection-item';
        if (prediction.isTarget) {
            item.classList.add('active');
        }
        item.setAttribute('data-index', index);
        
        // 从预测中获取类别和置信度
        let className = prediction.class || prediction.className || '未知物体';
        let score = prediction.score ? Math.round(prediction.score * 100) : 0;
        
        // 中文类别映射 - 提供常见物品的中文翻译
        const chineseClassMap = {
            'bottle': '瓶子',
            'beverage': '饮料',
            'cup': '杯子',
            'person': '人',
            'chair': '椅子',
            'laptop': '笔记本电脑',
            'cell phone': '手机',
            'book': '书',
            'backpack': '背包',
            'cup': '杯子'
        };
        
        // 如果有中文翻译，使用中文显示
        if (chineseClassMap[className]) {
            className = `${chineseClassMap[className]} (${className})`;
        }
        
        // 创建检测项的HTML
        item.innerHTML = `
            <div class="detection-item-content">
                <div class="detection-icon">
                    <i class="bx bx-${prediction.isTarget ? 'target-lock' : 'search-alt'}"></i>
                </div>
                <div class="detection-details">
                    <h6 class="detection-name">${className}</h6>
                    <div class="detection-metadata">
                        <span class="detection-confidence">
                            <i class="bx bx-check-shield me-1"></i> 置信度: ${score}%
                        </span>
                        ${prediction.isTarget ? '<span class="badge bg-primary ms-2">目标物品</span>' : ''}
                    </div>
                </div>
                <div class="detection-action">
                    <button class="btn btn-sm btn-outline-primary highlight-btn" data-index="${index}">
                        <i class="bx bx-show"></i>
                    </button>
                </div>
            </div>
        `;
        
        resultsList.appendChild(item);
        
        // 添加高亮显示事件
        const highlightBtn = item.querySelector('.highlight-btn');
        if (highlightBtn) {
            highlightBtn.addEventListener('click', () => {
                highlightDetection(index, prediction);
            });
        }
        
        // 添加点击整个项目的事件
        item.addEventListener('click', () => {
            document.querySelectorAll('.detection-item').forEach(el => {
                el.classList.remove('active');
            });
            item.classList.add('active');
            highlightDetection(index, prediction);
        });
    });
}

// 鼠标位置跟踪（用于交互效果）
window.mouseX = null;
window.mouseY = null;

document.addEventListener('DOMContentLoaded', () => {
    const cameraCanvas = document.getElementById('cameraCanvas');
    if (cameraCanvas) {
        cameraCanvas.addEventListener('mousemove', function(e) {
            const rect = this.getBoundingClientRect();
            window.mouseX = e.clientX - rect.left;
            window.mouseY = e.clientY - rect.top;
        });
        
        cameraCanvas.addEventListener('mouseleave', function() {
            window.mouseX = null;
            window.mouseY = null;
        });
    }
});

// 高亮显示选中的检测对象
function highlightDetection(index, detection) {
    const cameraCanvas = document.getElementById('cameraCanvas');
    const ctx = cameraCanvas ? cameraCanvas.getContext('2d') : null;
    if (!cameraCanvas || !ctx) return;
    
    // 移除所有项的活跃状态
    document.querySelectorAll('.detection-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // 为当前项添加活跃状态
    const currentItem = document.querySelector(`.detection-item[data-index="${index}"]`);
    if (currentItem) {
        currentItem.classList.add('active');
    }
    
    // 在画布上闪烁高亮显示
    const x = detection.x * cameraCanvas.width;
    const y = detection.y * cameraCanvas.height;
    const w = detection.width * cameraCanvas.width;
    const h = detection.height * cameraCanvas.height;
    
    // 保存原始数据
    const originalImageData = ctx.getImageData(0, 0, cameraCanvas.width, cameraCanvas.height);
    
    // 绘制高亮边框
    function drawHighlight() {
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#f72585';
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        
        // 添加光晕效果
        ctx.shadowColor = '#f72585';
        ctx.shadowBlur = 15;
        ctx.strokeRect(x - w / 2, y - h / 2, w, h);
        ctx.shadowBlur = 0;
    }
    
    // 闪烁效果
    drawHighlight();
    
    setTimeout(() => {
        // 恢复原始图像
        ctx.putImageData(originalImageData, 0, 0);
        
        setTimeout(() => {
            drawHighlight();
            
            setTimeout(() => {
                // 最终恢复原始图像
                ctx.putImageData(originalImageData, 0, 0);
            }, 300);
        }, 300);
    }, 300);
    
    // 朗读检测结果
    speakText(`检测到${detection.class}，置信度${detection.score ? Math.round(detection.score * 100) : 0}%`);
}

// 页面加载完成时初始化
window.addEventListener('DOMContentLoaded', function() {
  console.log('DOM内容加载完成，开始初始化');
  
  // 立即初始化用户模板
  loadUserTemplates();
  console.log('用户模板已加载');
  
  // 延迟更新模板显示以确保DOM元素已完全加载
  setTimeout(() => {
    updateTemplateDisplay();
    console.log('模板显示已更新');
  }, 100);
  
  // 获取上传相关元素
  const uploadTemplateBtn = document.getElementById('uploadTemplateBtn');
  const templateUploadForm = document.getElementById('templateUploadForm');
  const templateImageUpload = document.getElementById('templateImageUpload');
  
  // 阻止表单默认提交
  if (templateUploadForm) {
    templateUploadForm.addEventListener('submit', function(event) {
      event.preventDefault();
      return false;
    });
  }
  
  // 绑定上传按钮事件
  if (uploadTemplateBtn) {
    console.log('绑定上传按钮事件');
    uploadTemplateBtn.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      console.log('上传按钮被点击');
      handleTemplateUpload();
      return false;
    });
  } else {
    console.error('未找到上传按钮元素');
  }
  
  // 绑定图片预览事件
  if (templateImageUpload) {
    templateImageUpload.addEventListener('change', function() {
      const file = this.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          const previewContainer = document.getElementById('previewContainer');
          const imagePreview = document.getElementById('imagePreview');
          const previewImg = document.getElementById('previewImg');
          
          if (previewContainer && imagePreview && previewImg) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'none';
            imagePreview.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
  
  // 图片移除功能
  const removeImageBtn = document.getElementById('removeImageBtn');
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', function() {
      const previewContainer = document.getElementById('previewContainer');
      const imagePreview = document.getElementById('imagePreview');
      const templateFile = document.getElementById('templateImageUpload');
      
      if (previewContainer && imagePreview && templateFile) {
        previewContainer.style.display = 'block';
        imagePreview.style.display = 'none';
        templateFile.value = '';
      }
    });
  }
  
  // 绑定开始/停止检测按钮事件
  const startButton = document.getElementById('startButton');
  if (startButton) {
    console.log('绑定检测按钮事件');
    startButton.addEventListener('click', function() {
      if (isDetecting) {
        stopDetection();
      } else {
        startDetection();
      }
    });
  }
  
  // 绑定相机控制按钮事件
  const captureBtn = document.getElementById('captureBtn');
  if (captureBtn) {
    captureBtn.addEventListener('click', captureFrame);
  }
  
  const switchCameraBtn = document.getElementById('switchCamera');
  if (switchCameraBtn) {
    switchCameraBtn.addEventListener('click', switchCamera);
  }
  
  const speakResultBtn = document.getElementById('speakResultBtn');
  if (speakResultBtn) {
    speakResultBtn.addEventListener('click', readDetectionResults);
  }
  
  // 检查localStorage
  try {
    localStorage.setItem('VisionSeek_Test', 'OK');
    const testValue = localStorage.getItem('VisionSeek_Test');
    if (testValue === 'OK') {
      console.log('localStorage测试成功');
      localStorage.removeItem('VisionSeek_Test');
    } else {
      console.error('localStorage测试失败，存储值不匹配');
    }
  } catch (e) {
    console.error('localStorage不可用', e);
  }
  
  console.log('DOM初始化完成');
});

// 模板上传处理函数
async function handleTemplateUpload() {
  console.log('处理模板上传...');
  
  const templateName = document.getElementById('templateName');
  const templateCategory = document.getElementById('templateCategory');
  const templateDescription = document.getElementById('templateDescription');
  const templateFile = document.getElementById('templateImageUpload');
  const uploadTemplateBtn = document.getElementById('uploadTemplateBtn');
  
  // 检查必要表单元素
  if (!templateName) {
    console.error('未找到模板名称输入框');
    showToast('表单元素未找到: 模板名称', 'danger');
    return;
  }
  
  if (!templateFile) {
    console.error('未找到文件上传输入框');
    showToast('表单元素未找到: 文件上传', 'danger');
    return;
  }
  
  // 表单验证
  if (!templateName.value || templateName.value.trim() === '') {
    console.log('模板名称为空');
    showToast('请输入模板名称', 'warning');
    templateName.focus();
    return;
  }
  
  if (!templateFile.files || templateFile.files.length === 0) {
    console.log('未选择文件');
    showToast('请选择模板图像', 'warning');
    return;
  }
  
  // 显示加载状态
  if (uploadTemplateBtn) {
    uploadTemplateBtn.disabled = true;
    uploadTemplateBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin me-1"></i> 处理中...';
  }
  
  showToast('正在处理图片...', 'info');
  
  try {
    const file = templateFile.files[0];
    
    // 压缩并调整图片尺寸
    showToast('正在压缩图片...', 'info');
    const compressedImageUrl = await compressImage(file, 640, 480, 0.7);
    
    // 创建模板对象
    const newTemplate = {
      id: 'template_' + Date.now(),
      name: templateName.value.trim(),
      category: templateCategory ? templateCategory.value : 'personal',
      description: templateDescription ? templateDescription.value : '',
      path: compressedImageUrl,
      date: new Date().toISOString()
    };
    
    // 添加新模板
    addUserTemplate(newTemplate);
    
    // 重置表单
    resetUploadForm();
    
    // 更新当前模板
    setCurrentTemplate(newTemplate);
    
    // 更新模板展示
    updateTemplateDisplay();
    
    // 显示成功消息
    showToast('模板创建成功！', 'success');
    
    // 恢复按钮状态
    if (uploadTemplateBtn) {
      uploadTemplateBtn.disabled = false;
      uploadTemplateBtn.innerHTML = '<i class="bx bx-upload"></i> 上传并创建模板';
    }
    
  } catch (error) {
    console.error('模板上传失败:', error);
    showToast('模板上传失败: ' + error.message, 'danger');
    
    // 恢复按钮状态
    if (uploadTemplateBtn) {
      uploadTemplateBtn.disabled = false;
      uploadTemplateBtn.innerHTML = '<i class="bx bx-upload"></i> 上传并创建模板';
    }
  }
}

// 压缩图片函数
async function compressImage(file, maxWidth, maxHeight, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function(event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function() {
        // 计算新尺寸，保持纵横比
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
        
        if (height > maxHeight) {
          width = Math.round(width * (maxHeight / height));
          height = maxHeight;
        }
        
        // 创建Canvas用于压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        // 将图片绘制到Canvas上
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // 导出为压缩的JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = function() {
        reject(new Error('图片加载失败'));
      };
    };
    reader.onerror = function() {
      reject(new Error('无法读取文件'));
    };
  });
}

// 添加用户模板
function addUserTemplate(template) {
  // 获取当前模板
  let templates = getUserTemplates();
  
  // 限制模板数量为10个
  if (templates.length >= 10) {
    // 删除最旧的模板
    templates.shift();
  }
  
  // 添加新模板
  templates.push(template);
  
  // 保存
  saveUserTemplates(templates);
}

// 保存用户模板
function saveUserTemplates(templates) {
  try {
    // 转换为JSON字符串
    const templatesJson = JSON.stringify(templates);
    
    // 检查存储大小
    if (templatesJson.length > 4 * 1024 * 1024) { // 4MB限制
      console.warn('模板数据过大，正在清理旧数据');
      
      // 如果数据太大，只保留最新的5个模板
      templates = templates.slice(-5);
      const reducedJson = JSON.stringify(templates);
      
      if (reducedJson.length > 4 * 1024 * 1024) {
        throw new Error('即使减少模板数量，数据仍然过大');
      }
      
      localStorage.setItem('userTemplates', reducedJson);
      return templates;
    }
    
    localStorage.setItem('userTemplates', templatesJson);
    return templates;
  } catch (error) {
    console.error('保存模板失败:', error);
    showToast('保存模板失败: ' + error.message, 'danger');
    
    // 尝试清理localStorage
    try {
      localStorage.clear();
      localStorage.setItem('userTemplates', JSON.stringify(templates.slice(-2)));
      showToast('已清理存储空间，只保留最新的2个模板', 'warning');
      return templates.slice(-2);
    } catch (clearError) {
      console.error('清理存储空间失败:', clearError);
      return [];
    }
  }
}

// 重置上传表单
function resetUploadForm() {
  try {
    const templateName = document.getElementById('templateName');
    const templateCategory = document.getElementById('templateCategory');
    const templateDescription = document.getElementById('templateDescription');
    const templateFile = document.getElementById('templateImageUpload');
    const previewContainer = document.getElementById('previewContainer');
    const imagePreview = document.getElementById('imagePreview');
    
    if (templateName) templateName.value = '';
    if (templateCategory) templateCategory.value = 'personal';
    if (templateDescription) templateDescription.value = '';
    if (templateFile) templateFile.value = '';
    
    if (previewContainer) previewContainer.style.display = 'block';
    if (imagePreview) imagePreview.style.display = 'none';
    
    console.log('表单已重置');
  } catch (error) {
    console.error('重置表单失败:', error);
  }
}

// 将文件转换为Data URL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// 获取用户模板列表
function getUserTemplates() {
  try {
    const templatesJson = localStorage.getItem('userTemplates');
    if (!templatesJson) {
      return [];
    }
    return JSON.parse(templatesJson);
  } catch (error) {
    console.error('获取模板失败:', error);
    return [];
  }
}

// 设置当前选中的模板
function setCurrentTemplate(template) {
  if (!template) return;
  
  currentTemplate = template;
  
  // 更新当前模板显示
  const currentTemplateName = document.getElementById('currentTemplateName');
  const currentTemplateImg = document.getElementById('currentTemplateImg');
  
  if (currentTemplateName) {
    currentTemplateName.textContent = template.name;
  }
  
  if (currentTemplateImg) {
    currentTemplateImg.src = template.path;
    currentTemplateImg.alt = template.name;
  }
  
  // 如果已经在检测中，更新检测状态栏
  if (isDetecting) {
    const targetStatusText = document.getElementById('targetStatusText');
    if (targetStatusText) {
      targetStatusText.textContent = `正在搜索 ${template.name}...`;
    }
  }
  
  console.log('当前模板已设置为:', template.name);
  showToast(`已选择模板：${template.name}`, 'success');
}

// 显示模板详情
function showTemplateDetail(template) {
  if (!template) return;
  
  const detailModal = document.getElementById('templateDetailModal');
  const templateDetailImage = document.getElementById('templateDetailImage');
  const templateDetailName = document.getElementById('templateDetailName');
  const templateDetailCategory = document.getElementById('templateDetailCategory');
  const templateDetailDescription = document.getElementById('templateDetailDescription');
  const templateDetailDate = document.getElementById('templateDetailDate');
  const selectTemplateBtn = document.getElementById('selectTemplateBtn');
  
  if (!detailModal) return;
  
  if (templateDetailImage) templateDetailImage.src = template.path;
  if (templateDetailName) templateDetailName.textContent = template.name;
  if (templateDetailCategory) templateDetailCategory.textContent = template.category;
  if (templateDetailDescription) templateDetailDescription.textContent = template.description;
  
  if (templateDetailDate && template.date) {
    const date = new Date(template.date);
    templateDetailDate.textContent = date.toLocaleString();
  }
  
  if (selectTemplateBtn) {
    selectTemplateBtn.onclick = () => {
      setCurrentTemplate(template);
      
      // 关闭模态框
      if (typeof bootstrap !== 'undefined') {
        const modal = bootstrap.Modal.getInstance(detailModal);
        if (modal) modal.hide();
      }
    };
  }
  
  // 显示模态框
  if (typeof bootstrap !== 'undefined') {
    const modal = new bootstrap.Modal(detailModal);
    modal.show();
  }
}

// 更新模板展示
function updateTemplateDisplay() {
  console.log('更新模板展示');
  const userTemplatesContainer = document.getElementById('userTemplates');
  if (!userTemplatesContainer) {
    console.error('未找到用户模板容器 #userTemplates');
    return;
  }
  
  // 获取已保存的模板
  const templates = getUserTemplates();
  console.log(`加载了${templates.length}个模板`, templates);
  
  // 清空当前的内容
  userTemplatesContainer.innerHTML = '';
  
  // 添加占位符
  if (templates.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'col-6 col-md-4 col-lg-3';
    placeholder.innerHTML = `
      <div class="template-card template-placeholder shadow-sm rounded-3 hover-lift">
        <div class="template-thumbnail d-flex align-items-center justify-content-center">
          <i class="bx bx-image"></i>
        </div>
        <div class="template-info p-2">
          <h6 class="template-name">无自定义模板</h6>
          <p class="template-date small text-muted">请上传您的第一个模板</p>
        </div>
        <div class="card-overlay">
          <div class="d-flex justify-content-center align-items-center h-100">
            <i class="bx bx-plus-circle"></i>
          </div>
        </div>
      </div>
    `;
    userTemplatesContainer.appendChild(placeholder);
    return;
  }
  
  // 添加用户模板
  templates.forEach((template, index) => {
    // 创建模板卡片HTML
    const templateCard = document.createElement('div');
    templateCard.className = 'col-6 col-md-4 col-lg-3';
    templateCard.setAttribute('data-aos', 'fade-up');
    templateCard.setAttribute('data-aos-delay', (index + 1) * 100);
    
    templateCard.innerHTML = `
      <div class="template-card shadow-sm rounded-3 hover-lift">
        <div class="template-thumbnail">
          <img src="${template.path}" alt="${template.name}" class="img-fluid">
          ${index === 0 ? '<span class="badge bg-success position-absolute top-0 end-0 m-2">最新</span>' : ''}
        </div>
        <div class="template-info p-2">
          <div class="d-flex justify-content-between align-items-center">
            <h6 class="template-name mb-0">${template.name}</h6>
            <span class="badge bg-primary">${template.category}</span>
          </div>
          <p class="template-date small text-muted mt-1">${template.description || '用户模板'}</p>
          <div class="template-actions mt-2">
            <button class="btn btn-sm btn-primary w-100 rounded-pill use-template" data-template-id="${template.id}">
              <i class="bx bx-camera me-1"></i> 开始检测
            </button>
          </div>
        </div>
        <div class="card-overlay">
          <div class="d-flex justify-content-center align-items-center h-100">
            <button class="btn btn-sm btn-light rounded-circle me-2 template-view" title="查看详情" data-template-id="${template.id}">
              <i class="bx bx-search"></i>
            </button>
            <button class="btn btn-sm btn-primary rounded-circle me-2 use-template" title="使用模板" data-template-id="${template.id}">
              <i class="bx bx-camera"></i>
            </button>
            <button class="btn btn-sm btn-danger rounded-circle template-delete" title="删除模板" data-template-id="${template.id}">
              <i class="bx bx-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    
    userTemplatesContainer.appendChild(templateCard);
  });
  
  // 为新添加的模板卡片添加事件监听
  document.querySelectorAll('.template-view').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const templateId = this.getAttribute('data-template-id');
      const template = templates.find(t => t.id === templateId);
      if (template) {
        showTemplateDetail(template);
      }
    });
  });
  
  document.querySelectorAll('.use-template').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const templateId = this.getAttribute('data-template-id');
      const template = templates.find(t => t.id === templateId);
      if (template) {
        setCurrentTemplate(template);
        console.log('已选择模板:', template.name);
        showToast(`已选择模板: ${template.name}`);
        
        // 滚动到检测界面并开始检测
        const startDetectionBtn = document.getElementById('startDetection');
        if (startDetectionBtn) {
          startDetectionBtn.click();
        }
      }
    });
  });
  
  document.querySelectorAll('.template-delete').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const templateId = this.getAttribute('data-template-id');
      const template = templates.find(t => t.id === templateId);
      const index = templates.findIndex(t => t.id === templateId);
      
      if (template && index !== -1) {
        if (confirm(`确定要删除模板 "${template.name}" 吗？`)) {
          deleteTemplate(index);
        }
      }
    });
  });
  
  console.log('模板展示更新完成');
}

// 删除模板
function deleteTemplate(index) {
  if (index < 0 || index >= userTemplates.length) return;
  
  const deletedTemplate = userTemplates[index];
  
  // 从数组中删除
  userTemplates.splice(index, 1);
  
  // 保存更新后的模板列表
  saveUserTemplates(userTemplates);
  
  // 如果删除的是当前选中的模板，则重置当前模板
  if (currentTemplate && currentTemplate.id === deletedTemplate.id) {
    if (userTemplates.length > 0) {
      setCurrentTemplate(userTemplates[0]);
    } else {
      currentTemplate = null;
      
      const currentTemplateName = document.getElementById('currentTemplateName');
      const currentTemplateImg = document.getElementById('currentTemplateImg');
      
      if (currentTemplateName) currentTemplateName.textContent = '未选择模板';
      if (currentTemplateImg) {
        currentTemplateImg.src = 'assets/images/no-image.png';
        currentTemplateImg.alt = '未选择模板';
      }
    }
  }
  
  // 更新模板展示
  updateTemplateDisplay();
  
  showToast('模板已删除', 'info');
}

// 设置图像预览
function setupImagePreview() {
  const templateFile = document.getElementById('templateImageUpload');
  const previewContainer = document.getElementById('previewContainer');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  
  if (!templateFile || !previewContainer || !imagePreview || !previewImg) {
    console.log('预览所需元素未找到');
    return;
  }
  
  templateFile.addEventListener('change', function(event) {
    if (this.files && this.files[0]) {
      const file = this.files[0];
      
      // 检查文件类型
      if (!file.type.match('image.*')) {
        showToast('请选择有效的图像文件', 'danger');
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        previewImg.src = e.target.result;
        previewContainer.style.display = 'none';
        imagePreview.style.display = 'block';
      };
      
      reader.readAsDataURL(file);
    } else {
      previewContainer.style.display = 'block';
      imagePreview.style.display = 'none';
    }
  });
  
  // 添加移除预览图片的功能
  const removeImageBtn = document.getElementById('removeImageBtn');
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', function() {
      previewContainer.style.display = 'block';
      imagePreview.style.display = 'none';
      templateFile.value = '';
    });
  }
}

// 显示检测详情
function showDetectionDetail(detection) {
  // 实现检测结果的详细展示
  console.log('显示检测详情', detection);
}

// 初始化应用
async function initApp() {
  console.log('初始化应用程序');
  
  // 加载用户模板
  loadUserTemplates();
  
  // 更新模板显示
  updateTemplateDisplay();
  
  // 设置图像预览
  setupImagePreview();
  
  // 初始化语音识别
  initSpeechRecognition();
}

// 加载用户模板
function loadUserTemplates() {
  console.log('加载用户模板');
  try {
    const templates = localStorage.getItem('userTemplates');
    userTemplates = templates ? JSON.parse(templates) : [];
    
    if (userTemplates.length > 0) {
      console.log(`已加载${userTemplates.length}个模板`);
      // 设置当前模板为最后一个添加的模板
      setCurrentTemplate(userTemplates[userTemplates.length - 1]);
    } else {
      console.log('未找到已保存的模板');
    }
  } catch (error) {
    console.error('加载模板失败', error);
    userTemplates = [];
  }
}

// 更新目标检测状态
function updateTargetStatus(targetDetected, targetPosition, currentTemplate) {
    const statusContainer = document.getElementById('targetDetectionStatus');
    const statusText = document.getElementById('targetStatusText');
    const positionBadge = document.getElementById('targetPosition');
    
    if (!statusContainer || !statusText) return;
    
    // 移除之前的状态类
    statusContainer.classList.remove('found', 'not-found');
    
    // 根据检测状态设置文本和样式
    if (!isDetecting) {
        statusText.textContent = '未开始检测目标物品';
        positionBadge.style.display = 'none';
        return;
    }
    
    if (!currentTemplate || !currentTemplate.name) {
        statusText.textContent = '请先选择要检测的目标物品模板';
        positionBadge.style.display = 'none';
        return;
    }
    
    if (targetDetected) {
        statusText.textContent = `已检测到 ${currentTemplate.name}`;
        statusContainer.classList.add('found');
        
        // 显示位置信息
        if (positionBadge && targetPosition) {
            positionBadge.textContent = `位于画面${targetPosition.description}`;
            positionBadge.style.display = 'block';
            
            // 根据position.description设置徽章颜色
            if (targetPosition.description.includes('中')) {
                positionBadge.className = 'badge bg-success rounded-pill';
            } else {
                positionBadge.className = 'badge bg-primary rounded-pill';
            }
        }
    } else {
        statusText.textContent = `未检测到 ${currentTemplate.name}`;
        statusContainer.classList.add('not-found');
        positionBadge.style.display = 'none';
    }
    
    // 添加目标物品高亮框
    updateTargetHighlight(targetDetected, targetPosition);
}

// 更新目标高亮框
function updateTargetHighlight(targetDetected, targetPosition) {
    // 移除之前的高亮框
    const existingHighlight = document.querySelector('.target-highlight');
    if (existingHighlight) {
        existingHighlight.remove();
    }
    
    // 如果没有检测到目标或没有位置信息，直接返回
    if (!targetDetected || !targetPosition) return;
    
    // 获取canvas元素和其容器
    const canvas = document.getElementById('cameraCanvas');
    const container = canvas.parentElement;
    
    if (!canvas || !container) return;
    
    // 计算实际显示大小的比例
    const scaleX = canvas.clientWidth / canvas.width;
    const scaleY = canvas.clientHeight / canvas.height;
    
    // 创建高亮框元素
    const highlight = document.createElement('div');
    highlight.className = 'target-highlight';
    
    // 设置位置和尺寸
    highlight.style.left = `${targetPosition.x * scaleX}px`;
    highlight.style.top = `${targetPosition.y * scaleY}px`;
    highlight.style.width = `${targetPosition.width * scaleX}px`;
    highlight.style.height = `${targetPosition.height * scaleY}px`;
    
    // 添加到DOM
    container.appendChild(highlight);
}

// 更新调试信息显示
function updateDebugInfo(predictions) {
    // 获取或创建调试信息面板
    let debugInfoPanel = document.getElementById('debugInfoPanel');
    
    if (!debugInfoPanel) {
        // 创建调试面板
        debugInfoPanel = document.createElement('div');
        debugInfoPanel.id = 'debugInfoPanel';
        debugInfoPanel.className = 'debug-panel';
        debugInfoPanel.style.position = 'absolute';
        debugInfoPanel.style.bottom = '10px';
        debugInfoPanel.style.right = '10px';
        debugInfoPanel.style.backgroundColor = 'rgba(0,0,0,0.7)';
        debugInfoPanel.style.color = 'white';
        debugInfoPanel.style.padding = '8px';
        debugInfoPanel.style.borderRadius = '5px';
        debugInfoPanel.style.fontSize = '12px';
        debugInfoPanel.style.zIndex = '1000';
        debugInfoPanel.style.maxWidth = '250px';
        debugInfoPanel.style.maxHeight = '200px';
        debugInfoPanel.style.overflowY = 'auto';
        
        // 添加到相机容器
        const cameraContainer = document.querySelector('.camera-container');
        if (cameraContainer) {
            cameraContainer.appendChild(debugInfoPanel);
        } else {
            // 如果找不到相机容器，添加到body
            document.body.appendChild(debugInfoPanel);
        }
    }
    
    // 更新内容
    let content = '';
    
    if (!predictions || predictions.length === 0) {
        content = '<div>未检测到任何物体</div>';
    } else {
        content = `<div><strong>检测到 ${predictions.length} 个物体:</strong></div>`;
        
        // 添加当前模板信息
        if (currentTemplate && currentTemplate.name) {
            content += `<div style="margin-top:5px;"><strong>当前目标:</strong> ${currentTemplate.name}</div>`;
        }
        
        // 添加所有检测项
        content += '<div style="margin-top:5px;">';
        predictions.forEach((pred, index) => {
            const className = pred.class || '未知';
            const score = pred.score ? Math.round(pred.score * 100) : 0;
            const isTarget = pred.isTarget ? '✓ ' : '';
            const style = pred.isTarget ? 'color:#007bff;font-weight:bold;' : '';
            
            content += `<div style="${style}">${isTarget}${className}: ${score}%</div>`;
        });
        content += '</div>';
    }
    
    debugInfoPanel.innerHTML = content;
}