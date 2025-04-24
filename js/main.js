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

// 切换前置和后置摄像头
async function switchCamera(facingMode) {
    try {
        // 停止当前视频流
        const video = document.getElementById('videoElement');
        if (video.srcObject) {
            const tracks = video.srcObject.getTracks();
            tracks.forEach(track => track.stop());
        }

        // 获取新的视频流
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: { ideal: facingMode }
            },
            audio: false
        });

        video.srcObject = stream;
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.style.display = 'block';
                resolve(video);
            };
        });
    } catch (error) {
        console.error('切换摄像头失败:', error);
        return null;
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
    toastContainer.className = 'toast show align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
            <div class="d-flex">
                <div class="toast-body">
                    <i class="bx bx-${type === 'success' ? 'check' : 'x'}-circle me-2"></i> ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        </div>
    `;
    
    // 添加到页面
    document.body.appendChild(toastContainer);
    
    // 3秒后自动移除
    setTimeout(() => {
        toastContainer.remove();
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
    console.log('initDetection被调用，开始初始化检测');
    
    const video = document.getElementById('videoElement');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const ctx = cameraCanvas ? cameraCanvas.getContext('2d') : null;
    const loader = document.getElementById('loader');
    const detectionInterface = document.getElementById('detection-interface');
    
    if (!video || !cameraCanvas || !ctx) {
        console.error('视频或画布元素未找到');
        showToast('视频或画布元素未找到，请刷新页面重试', 'danger');
        return;
    }
    
    // 显示检测界面
    if (detectionInterface) {
        detectionInterface.style.display = 'block';
        window.scrollTo({
            top: detectionInterface.offsetTop - 80,
            behavior: 'smooth'
        });
    } else {
        console.error('未找到检测界面元素');
        showToast('检测界面加载失败，请刷新页面重试', 'danger');
        return;
    }
    
    // 设置Canvas尺寸
    setupCanvasSize();
    
    if (!isModelLoaded) {
        if (loader) loader.style.display = 'flex';
        if (loader && loader.querySelector('p')) loader.querySelector('p').textContent = '正在加载模型...';
        speakText('正在加载检测模型，请稍候');
        
        try {
            // 初始化检测器
            console.log('开始初始化检测器');
            if (typeof YoloDetector === 'undefined') {
                throw new Error('检测器模块未加载，请确认yoloDetector.js已正确引入');
            }
            
            detector = new YoloDetector();
            console.log('检测器实例已创建');
            
            // 等待检测器初始化完成
            await new Promise((resolve, reject) => {
                console.log('等待检测器初始化');
                const checkInit = () => {
                    if (detector && detector.initialized) {
                        console.log('检测器初始化成功');
                        resolve();
                    } else if (detector) {
                        console.log('检测器初始化中...');
                        setTimeout(checkInit, 500);
                    } else {
                        reject(new Error('检测器实例无效'));
                    }
                };
                checkInit();
            });
            
            // 加载模板图像
            if (!currentTemplate || !currentTemplate.path) {
                throw new Error('未选择模板或模板路径无效');
            }
            
            console.log('加载模板图像:', currentTemplate.path);
            const templatePath = currentTemplate.path;
            const template = new Image();
            template.crossOrigin = "Anonymous"; // 添加跨域支持
            template.src = templatePath;
            
            await new Promise((resolve, reject) => {
                template.onload = async () => {
                    console.log('模板图像加载成功，获取特征');
                    try {
                        const isGotten = await detector.getTemplate(template);
                        if (isGotten === 0) {
                            console.log('模板特征获取成功');
                            resolve();
                        } else {
                            console.error('模板特征获取失败');
                            reject(new Error('模板特征获取失败'));
                        }
                    } catch (error) {
                        console.error('获取模板特征时出错:', error);
                        reject(error);
                    }
                };
                template.onerror = () => {
                    console.error('模板图像加载失败');
                    reject(new Error('模板图像加载失败'));
                };
            });
            
            isModelLoaded = true;
            showToast('模型加载成功');
            speakText('模型加载完成');
        } catch (error) {
            console.error('模型加载失败', error);
            showToast('模型加载失败，请刷新重试: ' + error.message, 'danger');
            speakText('模型加载失败，请刷新页面重试');
            if (loader) loader.style.display = 'none';
            return;
        } finally {
            if (loader) loader.style.display = 'none';
        }
    }
    
    if (!isDetecting) {
        // 初始化摄像头
        try {
            console.log('开始初始化摄像头');
            await setupCamera();
            console.log('摄像头初始化成功');
            isDetecting = true;
            detectFrame();
            showToast('摄像头启动成功');
            speakText('摄像头已启动，开始检测');
        } catch (error) {
            console.error(error.message);
            isDetecting = false;
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.innerHTML = `<i class="bx bx-error-circle me-2"></i> ${error.message}`;
            
            if (detectionInterface && detectionInterface.querySelector('.container')) {
                detectionInterface.querySelector('.container').prepend(errorDiv);
            }
            
            showToast(error.message, 'danger');
            speakText('摄像头启动失败，' + error.message);
            return;
        }
    } else {
        console.log('已经在检测中，不需要重新初始化');
        showToast('继续检测中');
    }
}

// 检测帧处理
let lastFrameTime = 0;
const minFrameTime = 1000 / 15; // 限制最大帧率为15fps

async function detectFrame(timestamp = 0) {
    if (!isDetecting) return;
    
    const video = document.getElementById('videoElement');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const ctx = cameraCanvas ? cameraCanvas.getContext('2d') : null;
    const resultsList = document.getElementById('resultsList');
    const detectionCount = document.getElementById('detectionCount');
    
    if (!video || !cameraCanvas || !ctx || !resultsList) {
        console.error('检测所需元素未找到');
        isDetecting = false;
        return;
    }
    
    // 控制帧率
    if (timestamp - lastFrameTime < minFrameTime) {
        requestAnimationFrame(detectFrame);
        return;
    }
    
    lastFrameTime = timestamp;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

        try {
            if (!detector) {
                console.error('检测器未初始化');
                return;
            }
            
            const result = await detector.detect(cameraCanvas);

            // 清除上一帧
            ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
            ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

            // 更新检测计数
            if (detectionCount) {
                detectionCount.textContent = result.length;
            }

            // 绘制检测结果
            result.forEach(detection => {
                const x = detection.x * cameraCanvas.width;
                const y = detection.y * cameraCanvas.height;
                const w = detection.width * cameraCanvas.width;
                const h = detection.height * cameraCanvas.height;

                // 绘制边界框
                ctx.strokeStyle = '#4361ee';
                ctx.lineWidth = 3;
                ctx.strokeRect(x - w / 2, y - h / 2, w, h);

                // 绘制标签背景
                ctx.fillStyle = 'rgba(67, 97, 238, 0.85)';
                const textWidth = ctx.measureText(detection.class).width;
                ctx.fillRect(x - w / 2, y - h / 2 - 30, textWidth + 30, 30);

                // 绘制标签
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px Arial';
                ctx.fillText(detection.class, x - w / 2 + 10, y - h / 2 - 8);
                
                // 绘制鼠标悬停效果（仅响应式设计模式下可用）
                const boxLeft = x - w / 2;
                const boxTop = y - h / 2;
                const boxRight = x + w / 2;
                const boxBottom = y + h / 2;
                
                if (window.mouseX && window.mouseY) {
                    if (window.mouseX >= boxLeft && window.mouseX <= boxRight &&
                        window.mouseY >= boxTop && window.mouseY <= boxBottom) {
                        // 当鼠标悬停在检测框上时，显示增强边框
                        ctx.strokeStyle = '#f72585';
                        ctx.lineWidth = 4;
                        ctx.strokeRect(boxLeft, boxTop, w, h);
                    }
                }
            });

            // 更新检测结果显示
            updateResultsList(result);
        } catch (error) {
            console.error('检测过程发生错误:', error);
        }

        // 内存管理，减少内存泄漏
        if (tf && tf.memory && tf.memory().numTensors > 100) {
            tf.disposeVariables();
            if (tf.nextFrame) {
                await tf.nextFrame();
            }
        }
    }

    requestAnimationFrame(detectFrame);
}

// 更新结果列表
function updateResultsList(result) {
    const resultsList = document.getElementById('resultsList');
    if (!resultsList) return;
    
    resultsList.innerHTML = '';
    
    if (result.length === 0) {
        const noResultItem = document.createElement('div');
        noResultItem.className = 'detection-item';
        noResultItem.innerHTML = '<p><i class="bx bx-search"></i> 未检测到物体</p>';
        resultsList.appendChild(noResultItem);
        return;
    }
    
    result.forEach((detection, index) => {
        const item = document.createElement('div');
        item.className = 'detection-item';
        item.setAttribute('data-index', index);
        
        // 计算置信度百分比
        const confidence = detection.score ? Math.round(detection.score * 100) : '--';
        
        // 为不同类别设置不同徽章颜色
        let badgeColor = 'success';
        if (confidence < 70) badgeColor = 'warning';
        if (confidence < 50) badgeColor = 'danger';
        
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <h6 class="mb-0">${detection.class}</h6>
                <span class="badge bg-${badgeColor}">${confidence}%</span>
            </div>
            <p><i class="bx bx-map"></i> 位置：x=${detection.x.toFixed(2)}, y=${detection.y.toFixed(2)}</p>
            <p><i class="bx bx-box"></i> 尺寸：w=${detection.width.toFixed(2)}, h=${detection.height.toFixed(2)}</p>
        `;
        
        // 添加点击事件
        item.addEventListener('click', function() {
            // 高亮相应的检测框
            highlightDetection(index, detection);
            
            // 创建详细信息模态框
            showDetectionDetail(detection);
        });
        
        resultsList.appendChild(item);
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

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM加载完成，初始化应用');
  
  // 获取按钮元素
  const startDetectionBtn = document.getElementById('startDetectionBtn');
  const frontCameraBtn = document.getElementById('frontCameraBtn');
  const backCameraBtn = document.getElementById('backCameraBtn');
  const uploadTemplateBtn = document.getElementById('uploadTemplateBtn');
  const templateUploadForm = document.getElementById('templateUploadForm');
  
  // 增加按钮事件监听
  if (startDetectionBtn) {
    console.log('绑定开始检测按钮事件');
    startDetectionBtn.addEventListener('click', () => {
      console.log('开始检测按钮被点击');
      initDetection(); // 调用检测初始化函数
    });
  }
  
  // 添加相机切换按钮事件
  if (frontCameraBtn) {
    frontCameraBtn.addEventListener('click', () => {
      switchCamera('user');
      showToast('已切换至前置摄像头');
    });
  }
  
  if (backCameraBtn) {
    backCameraBtn.addEventListener('click', () => {
      switchCamera('environment');
      showToast('已切换至后置摄像头');
    });
  }
  
  // 初始化摄像头
  async function setupCamera() {
    const video = document.getElementById('videoElement');
    if (!video) {
      throw new Error('未找到视频元素');
    }
    
    // 停止之前的媒体流
    if (video.srcObject) {
      const tracks = video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      video.srcObject = stream;
      
      return new Promise((resolve) => {
        video.onloadedmetadata = () => {
          video.play().then(() => {
            resolve(video);
          }).catch(error => {
            console.error('视频播放失败:', error);
            throw new Error('无法播放摄像头视频');
          });
        };
      });
    } catch (error) {
      console.error('摄像头访问失败:', error);
      if (error.name === 'NotAllowedError') {
        throw new Error('摄像头访问被拒绝，请授予权限');
      } else if (error.name === 'NotFoundError') {
        throw new Error('未找到可用摄像头设备');
      } else {
        throw new Error('摄像头启动失败: ' + error.message);
      }
    }
  }

  // 处理模板上传
  if (templateUploadForm) {
    templateUploadForm.addEventListener('submit', handleTemplateUpload);
  }
  
  // 模板上传处理函数
  async function handleTemplateUpload(event) {
    event.preventDefault();
    
    const templateName = document.getElementById('templateName');
    const templateCategory = document.getElementById('templateCategory');
    const templateDescription = document.getElementById('templateDescription');
    const templateFile = document.getElementById('templateImageUpload');
    const uploadTemplateBtn = document.getElementById('uploadTemplateBtn');
    
    if (!templateName || !templateCategory || !templateDescription || !templateFile) {
      showToast('表单元素未找到', 'danger');
      return;
    }
    
    // 表单验证
    if (!templateName.value.trim()) {
      showToast('请输入模板名称', 'warning');
      templateName.focus();
      return;
    }
    
    if (!templateFile.files || templateFile.files.length === 0) {
      showToast('请选择模板图像', 'warning');
      return;
    }
    
    // 检查文件类型
    const file = templateFile.files[0];
    if (!file.type.match('image.*')) {
      showToast('请选择有效的图像文件', 'danger');
      return;
    }
    
    // 显示加载状态
    if (uploadTemplateBtn) {
      uploadTemplateBtn.disabled = true;
      uploadTemplateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 上传中...';
    }
    
    try {
      // 读取图像文件
      const imageUrl = await readFileAsDataURL(file);
      
      // 保存模板信息
      const template = {
        id: Date.now().toString(),
        name: templateName.value.trim(),
        category: templateCategory.value.trim(),
        description: templateDescription.value.trim(),
        path: imageUrl,
        date: new Date().toISOString()
      };
      
      // 保存至本地存储
      addUserTemplate(template);
      
      // 更新当前模板
      setCurrentTemplate(template);
      
      // 显示成功消息
      showToast('模板上传成功', 'success');
      
      // 关闭模态框
      const uploadModal = document.getElementById('uploadTemplateModal');
      if (uploadModal && typeof bootstrap !== 'undefined') {
        const modal = bootstrap.Modal.getInstance(uploadModal);
        if (modal) modal.hide();
      }
      
      // 重置表单
      templateUploadForm.reset();
      
      // 更新模板展示
      updateTemplateDisplay();
      
    } catch (error) {
      console.error('模板上传失败', error);
      showToast('模板上传失败: ' + error.message, 'danger');
    } finally {
      // 恢复按钮状态
      if (uploadTemplateBtn) {
        uploadTemplateBtn.disabled = false;
        uploadTemplateBtn.innerHTML = '<i class="bx bx-upload"></i> 上传并创建模板';
      }
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
  
  // 添加用户模板到localStorage
  function addUserTemplate(template) {
    const templates = getUserTemplates();
    templates.push(template);
    saveUserTemplates(templates);
  }
  
  // 保存用户模板到localStorage
  function saveUserTemplates(templates) {
    try {
      localStorage.setItem('userTemplates', JSON.stringify(templates));
      console.log('模板已保存到localStorage');
    } catch (error) {
      console.error('保存模板失败', error);
      showToast('保存模板失败: ' + error.message, 'danger');
    }
  }
  
  // 获取用户模板列表
  function getUserTemplates() {
    try {
      const templates = localStorage.getItem('userTemplates');
      return templates ? JSON.parse(templates) : [];
    } catch (error) {
      console.error('读取模板失败', error);
      showToast('读取模板失败，将使用空列表', 'warning');
      return [];
    }
  }

  // 初始化应用
  initApp();
});

// 初始化应用程序
async function initApp() {
  console.log('初始化应用程序');
  
  // 加载用户模板
  loadUserTemplates();
  
  // 更新模板显示
  updateTemplateDisplay();
  
  // 设置图像预览
  setupImagePreview();
  
  // 初始化语音识别
  initVoiceRecognition();
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

// 设置当前选中的模板
function setCurrentTemplate(template) {
  if (!template) return;
  
  currentTemplate = template;
  
  // 更新当前模板显示
  const currentTemplateName = document.getElementById('currentTemplateName');
  const currentTemplateImage = document.getElementById('currentTemplateImage');
  
  if (currentTemplateName) {
    currentTemplateName.textContent = template.name;
  }
  
  if (currentTemplateImage) {
    currentTemplateImage.src = template.path;
    currentTemplateImage.alt = template.name;
  }
  
  console.log('当前模板已设置为:', template.name);
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
  const templatesList = document.getElementById('templatesList');
  if (!templatesList) return;
  
  // 清空现有内容
  templatesList.innerHTML = '';
  
  if (!userTemplates || userTemplates.length === 0) {
    templatesList.innerHTML = `
      <div class="text-center p-4">
        <i class="bx bx-image bx-lg text-muted"></i>
        <p class="text-muted">未找到模板，请上传新模板</p>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#uploadTemplateModal">
          <i class="bx bx-plus"></i> 上传模板
        </button>
      </div>
    `;
    return;
  }
  
  // 创建模板卡片
  userTemplates.forEach((template, index) => {
    const card = document.createElement('div');
    card.className = 'col-md-4 mb-4';
    card.innerHTML = `
      <div class="card template-card ${currentTemplate && currentTemplate.id === template.id ? 'active' : ''}">
        <div class="template-image-container">
          <img src="${template.path}" class="card-img-top template-image" alt="${template.name}">
        </div>
        <div class="card-body">
          <h5 class="card-title">${template.name}</h5>
          <p class="card-text small text-muted">${template.category}</p>
          <div class="btn-group w-100">
            <button class="btn btn-outline-primary btn-sm view-template" data-index="${index}">
              <i class="bx bx-show"></i> 查看
            </button>
            <button class="btn btn-outline-success btn-sm select-template" data-index="${index}">
              <i class="bx bx-check"></i> 选择
            </button>
            <button class="btn btn-outline-danger btn-sm delete-template" data-index="${index}">
              <i class="bx bx-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    
    templatesList.appendChild(card);
  });
  
  // 绑定卡片上的按钮事件
  document.querySelectorAll('.view-template').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      showTemplateDetail(userTemplates[index]);
    });
  });
  
  document.querySelectorAll('.select-template').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      setCurrentTemplate(userTemplates[index]);
      
      // 更新活跃状态
      document.querySelectorAll('.template-card').forEach(card => card.classList.remove('active'));
      this.closest('.template-card').classList.add('active');
      
      showToast('已选择模板: ' + userTemplates[index].name);
    });
  });
  
  document.querySelectorAll('.delete-template').forEach(button => {
    button.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      
      if (confirm(`确定要删除模板 "${userTemplates[index].name}" 吗？`)) {
        deleteTemplate(index);
      }
    });
  });
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
      const currentTemplateImage = document.getElementById('currentTemplateImage');
      
      if (currentTemplateName) currentTemplateName.textContent = '未选择模板';
      if (currentTemplateImage) {
        currentTemplateImage.src = 'assets/images/no-image.png';
        currentTemplateImage.alt = '未选择模板';
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