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

document.addEventListener('DOMContentLoaded', async () => {
    const video = document.getElementById('videoElement');
    const cameraCanvas = document.getElementById('cameraCanvas');
    const ctx = cameraCanvas.getContext('2d');
    const loader = document.getElementById('loader');
    const resultsList = document.getElementById('resultsList');
    const detectionCount = document.getElementById('detectionCount');
    const detectionInterface = document.getElementById('detection-interface');
    const startDetectionBtn = document.getElementById('startDetection');
    const captureBtn = document.getElementById('captureBtn');
    const switchCameraBtn = document.getElementById('switchCamera');
    const voiceControlBtn = document.getElementById('voiceControlBtn');
    const startVoiceBtn = document.getElementById('startVoiceBtn');
    const speakResultBtn = document.getElementById('speakResultBtn');
    
    // 初始化语音识别
    initSpeechRecognition();
    
    // 更新当前模板显示
    updateCurrentTemplateDisplay();
    
    // 语音控制按钮事件
    if (voiceControlBtn) {
        voiceControlBtn.addEventListener('click', () => {
            if (recognitionActive) {
                stopListening();
            } else {
                startListening();
            }
        });
    }
    
    // 开始语音按钮事件
    if (startVoiceBtn) {
        startVoiceBtn.addEventListener('click', () => {
            startListening();
        });
    }
    
    // 朗读结果按钮事件
    if (speakResultBtn) {
        speakResultBtn.addEventListener('click', readDetectionResults);
    }
    
    // 滚动导航栏变化效果
    window.addEventListener('scroll', function() {
        const navbar = document.querySelector('.navbar');
        if (window.scrollY > 100) {
            navbar.style.padding = '0.5rem 0';
            navbar.style.backgroundColor = 'rgba(67, 97, 238, 0.95)';
        } else {
            navbar.style.padding = '1rem 0';
            navbar.style.backgroundColor = 'var(--primary)';
        }
    });
    
    let currentFacingMode = 'environment'; // 默认使用后置摄像头
    let detector = null;
    let isModelLoaded = false;
    let isDetecting = false;

    // 设置Canvas尺寸
    function setupCanvasSize() {
        const containerWidth = cameraCanvas.parentElement.clientWidth;
        const containerHeight = cameraCanvas.parentElement.clientHeight;
        cameraCanvas.width = containerWidth;
        cameraCanvas.height = containerHeight;
    }
    
    // 响应窗口大小变化
    window.addEventListener('resize', setupCanvasSize);
    
    // 初始化摄像头并开始检测
    async function initDetection() {
        detectionInterface.style.display = 'block';
        window.scrollTo({
            top: detectionInterface.offsetTop - 80,
            behavior: 'smooth'
        });
        
        setupCanvasSize();
        
        if (!isModelLoaded) {
            loader.style.display = 'flex';
            loader.querySelector('p').textContent = '正在加载模型...';
            speakText('正在加载检测模型，请稍候');
            
            try {
                // 初始化检测器
                detector = new YoloDetector();
                
                await new Promise(resolve => {
                    const checkInit = () => {
                        if (detector.initialized) {
                            resolve();
                        } else {
                            setTimeout(checkInit, 100);
                        }
                    };
                    checkInit();
                });
                
                // 加载模板图像
                const templatePath = currentTemplate.path;
                const template = new Image();
                template.src = templatePath;
                await new Promise(resolve => {
                    template.onload = async () => {
                        const isGotten = await detector.getTemplate(template);
                        if (isGotten === 0) {
                            console.log('模板特征获取成功');
                        } else {
                            console.error('模板特征获取失败');
                        }
                        resolve();
                    };
                });
                
                isModelLoaded = true;
                showToast('模型加载成功');
                speakText('模型加载完成');
            } catch (error) {
                console.error('模型加载失败', error);
                showToast('模型加载失败，请刷新重试', 'danger');
                speakText('模型加载失败，请刷新页面重试');
            } finally {
                loader.style.display = 'none';
            }
        }
        
        if (!isDetecting) {
            // 初始化摄像头
            try {
                await setupCamera();
                console.log('摄像头初始化成功');
                isDetecting = true;
                detectFrame();
                showToast('摄像头启动成功');
                speakText('摄像头已启动，开始检测');
            } catch (error) {
                console.error(error.message);
                const errorDiv = document.createElement('div');
                errorDiv.className = 'alert alert-danger';
                errorDiv.innerHTML = `<i class="bx bx-error-circle me-2"></i> ${error.message}`;
                detectionInterface.querySelector('.container').prepend(errorDiv);
                showToast(error.message, 'danger');
                speakText('摄像头启动失败，' + error.message);
                return;
            }
        }
    }
    
    // 开始检测按钮事件
    startDetectionBtn.addEventListener('click', initDetection);
    
    // 拍照按钮事件
    captureBtn.addEventListener('click', captureFrame);
    
    // 切换摄像头按钮事件
    switchCameraBtn.addEventListener('click', async () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        await switchCamera(currentFacingMode);
        showToast(`已切换至${currentFacingMode === 'environment' ? '后置' : '前置'}摄像头`);
        speakText(`已切换至${currentFacingMode === 'environment' ? '后置' : '前置'}摄像头`);
    });

    // 添加表单提交事件
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const nameInput = document.getElementById('name');
            const emailInput = document.getElementById('email');
            const messageInput = document.getElementById('message');
            
            if (nameInput.value && emailInput.value && messageInput.value) {
                // 在实际项目中这里会发送数据到服务器
                showToast('消息已发送，我们会尽快回复您');
                contactForm.reset();
            } else {
                showToast('请填写完整的信息', 'danger');
            }
        });
    }

    let lastFrameTime = 0;
    const minFrameTime = 1000 / 15; // 限制最大帧率为15fps

    async function detectFrame(timestamp = 0) {
        if (!isDetecting) return;
        
        // 控制帧率
        if (timestamp - lastFrameTime < minFrameTime) {
            requestAnimationFrame(detectFrame);
            return;
        }
        
        // 输出实时帧率（仅开发环境）
        // const fps = 1000 / (timestamp - lastFrameTime);
        // console.log(`当前帧率: ${fps.toFixed(2)} fps`);
        
        lastFrameTime = timestamp;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

            try {
                const result = await detector.detect(cameraCanvas);

                // 清除上一帧
                ctx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
                ctx.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);

                // 更新检测计数
                detectionCount.textContent = result.length;

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

            if (tf.memory().numTensors > 100) {  // 降低阈值
                tf.disposeVariables();
                await tf.nextFrame();  // 等待下一帧before继续
            }
        }

        requestAnimationFrame(detectFrame);
    }

    // 鼠标位置跟踪（用于交互效果）
    window.mouseX = null;
    window.mouseY = null;
    
    cameraCanvas.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        window.mouseX = e.clientX - rect.left;
        window.mouseY = e.clientY - rect.top;
    });
    
    cameraCanvas.addEventListener('mouseleave', function() {
        window.mouseX = null;
        window.mouseY = null;
    });

    // 更新结果列表
    function updateResultsList(result) {
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
    
    // 高亮显示选中的检测对象
    function highlightDetection(index, detection) {
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
    
    // 显示检测详情模态框
    function showDetectionDetail(detection) {
        // 检查是否已存在模态框，如果存在则先移除
        let existingModal = document.getElementById('detectionDetailModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // 创建模态框
        const modalElement = document.createElement('div');
        modalElement.className = 'modal fade';
        modalElement.id = 'detectionDetailModal';
        modalElement.tabIndex = '-1';
        modalElement.setAttribute('aria-hidden', 'true');
        
        // 计算置信度百分比和类别
        const confidence = detection.score ? Math.round(detection.score * 100) : '--';
        
        // 模态框内容
        modalElement.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title"><i class="bx bx-detail"></i> 检测详情：${detection.class}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">置信度</span>
                                    <span class="detail-value">${confidence}%</span>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">类别</span>
                                    <span class="detail-value">${detection.class}</span>
                                </div>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">X坐标</span>
                                    <span class="detail-value">${detection.x.toFixed(4)}</span>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">Y坐标</span>
                                    <span class="detail-value">${detection.y.toFixed(4)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">宽度</span>
                                    <span class="detail-value">${detection.width.toFixed(4)}</span>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="detail-card">
                                    <span class="detail-label">高度</span>
                                    <span class="detail-value">${detection.height.toFixed(4)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                        <button type="button" class="btn btn-primary" id="captureDetailBtn">截图保存</button>
                        <button type="button" class="btn btn-info" id="readDetailBtn">朗读结果</button>
                    </div>
                </div>
            </div>
        `;
        
        // 添加到页面
        document.body.appendChild(modalElement);
        
        // 显示模态框
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // 为截图按钮添加事件
        const captureDetailBtn = document.getElementById('captureDetailBtn');
        if (captureDetailBtn) {
            captureDetailBtn.addEventListener('click', captureFrame);
        }
        
        // 为朗读按钮添加事件
        const readDetailBtn = document.getElementById('readDetailBtn');
        if (readDetailBtn) {
            readDetailBtn.addEventListener('click', () => {
                speakText(`检测到${detection.class}，置信度${confidence}%，位置X${detection.x.toFixed(2)}Y${detection.y.toFixed(2)}，尺寸${detection.width.toFixed(2)}乘${detection.height.toFixed(2)}`);
            });
        }
    }

    // ===== 模板上传功能实现 =====
    
    // 初始化模板数据
    loadUserTemplates();
    
    // 上传图片预览
    const uploadInput = document.getElementById('templateImageUpload');
    const previewContainer = document.getElementById('uploadPreviewContainer');
    
    if (uploadInput) {
        uploadInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const file = this.files[0];
                
                // 检查文件类型
                if (!file.type.match('image.*')) {
                    showToast('请选择图片文件', 'warning');
                    return;
                }
                
                // 检查文件大小 (最大5MB)
                if (file.size > 5 * 1024 * 1024) {
                    showToast('图片大小不能超过5MB', 'warning');
                    return;
                }
                
                // 显示预览
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewContainer.innerHTML = `
                        <div class="preview-image">
                            <img src="${e.target.result}" alt="预览" class="img-fluid">
                            <button type="button" class="btn-close remove-preview" aria-label="移除"></button>
                        </div>
                    `;
                    
                    // 添加移除预览的事件
                    document.querySelector('.remove-preview').addEventListener('click', function() {
                        previewContainer.innerHTML = '';
                        uploadInput.value = '';
                    });
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // 模板表单提交
    const templateForm = document.getElementById('templateForm');
    if (templateForm) {
        templateForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const templateName = document.getElementById('templateName').value;
            const templateCategory = document.getElementById('templateCategory').value;
            const templateDescription = document.getElementById('templateDescription').value;
            const templateImageUpload = document.getElementById('templateImageUpload');
            
            // 验证表单
            if (!templateName || !templateCategory || !templateImageUpload.files[0]) {
                showToast('请填写完整的模板信息', 'warning');
                return;
            }
            
            // 在实际应用中，这里应该将文件上传到服务器
            // 这里仅做前端模拟演示
            
            const reader = new FileReader();
            reader.onload = function(e) {
                // 创建新模板对象
                const newTemplate = {
                    id: Date.now().toString(),
                    path: e.target.result, // 在真实环境中，这会是服务器返回的URL
                    name: templateName,
                    category: templateCategory,
                    description: templateDescription,
                    date: new Date().toISOString()
                };
                
                // 添加到模板列表
                userTemplates.push(newTemplate);
                saveUserTemplates();
                
                // 更新模板展示区
                updateTemplateGallery();
                
                // 重置表单
                templateForm.reset();
                previewContainer.innerHTML = '';
                
                // 显示成功提示
                showToast('模板添加成功');
                speakText(`已成功添加${templateName}模板`);
            };
            reader.readAsDataURL(templateImageUpload.files[0]);
        });
    }
    
    // 加载用户模板
    function loadUserTemplates() {
        const savedTemplates = localStorage.getItem('userTemplates');
        if (savedTemplates) {
            userTemplates = JSON.parse(savedTemplates);
            updateTemplateGallery();
        } else {
            // 初始化默认模板
            userTemplates = [
                {
                    id: '1',
                    path: 'templates/000001.jpg',
                    name: '水杯',
                    category: '日用品',
                    description: '日常使用的水杯',
                    date: new Date().toISOString()
                },
                {
                    id: '2',
                    path: 'templates/000002.jpg',
                    name: '手机',
                    category: '电子设备',
                    description: '智能手机',
                    date: new Date().toISOString()
                },
                {
                    id: '3',
                    path: 'templates/000003.jpg',
                    name: '钥匙',
                    category: '日用品',
                    description: '家门钥匙',
                    date: new Date().toISOString()
                }
            ];
            saveUserTemplates();
            updateTemplateGallery();
        }
    }
    
    // 保存用户模板到本地存储
    function saveUserTemplates() {
        localStorage.setItem('userTemplates', JSON.stringify(userTemplates));
    }
    
    // 更新模板展示区
    function updateTemplateGallery() {
        const galleryContainer = document.getElementById('templateGallery');
        if (!galleryContainer) return;
        
        galleryContainer.innerHTML = '';
        
        if (userTemplates.length === 0) {
            galleryContainer.innerHTML = '<p class="text-center">暂无模板，请添加新模板</p>';
            return;
        }
        
        userTemplates.forEach(template => {
            const templateCard = document.createElement('div');
            templateCard.className = 'col-md-4 col-sm-6 mb-4';
            templateCard.innerHTML = `
                <div class="template-card" data-id="${template.id}">
                    <div class="template-image">
                        <img src="${template.path}" alt="${template.name}" class="img-fluid">
                    </div>
                    <div class="template-info">
                        <h5>${template.name}</h5>
                        <span class="badge bg-primary">${template.category}</span>
                        <p class="mt-2">${template.description || '无描述'}</p>
                        <div class="template-actions">
                            <button type="button" class="btn btn-sm btn-primary use-template">
                                <i class="bx bx-camera"></i> 使用
                            </button>
                            <button type="button" class="btn btn-sm btn-danger delete-template">
                                <i class="bx bx-trash"></i> 删除
                            </button>
                        </div>
                    </div>
                </div>
            `;
            
            galleryContainer.appendChild(templateCard);
            
            // 为"使用"按钮添加事件
            templateCard.querySelector('.use-template').addEventListener('click', function() {
                const templateId = this.closest('.template-card').getAttribute('data-id');
                const selectedTemplate = userTemplates.find(t => t.id === templateId);
                
                if (selectedTemplate) {
                    currentTemplate = selectedTemplate;
                    showToast(`已选择模板: ${selectedTemplate.name}`);
                    speakText(`已选择${selectedTemplate.name}模板`);
                    
                    // 更新当前模板显示
                    updateCurrentTemplateDisplay();
                    
                    // 关闭模态框
                    const modalElement = document.getElementById('templateModalSelector');
                    if (modalElement) {
                        const modal = bootstrap.Modal.getInstance(modalElement);
                        if (modal) {
                            modal.hide();
                        }
                    }
                    
                    // 如果在检测界面，重新应用模板
                    if (isDetecting && detector) {
                        // 加载模板图像
                        const template = new Image();
                        template.src = selectedTemplate.path;
                        template.onload = async () => {
                            const isGotten = await detector.getTemplate(template);
                            if (isGotten === 0) {
                                console.log('模板特征获取成功');
                                showToast('模板已更新');
                            } else {
                                console.error('模板特征获取失败');
                                showToast('模板更新失败', 'danger');
                            }
                        };
                    } else {
                        // 提示用户进入检测界面
                        setTimeout(() => {
                            showToast('请点击"开始检测"使用该模板');
                        }, 1000);
                    }
                }
            });
            
            // 为"删除"按钮添加事件
            templateCard.querySelector('.delete-template').addEventListener('click', function() {
                const templateId = this.closest('.template-card').getAttribute('data-id');
                const templateIndex = userTemplates.findIndex(t => t.id === templateId);
                
                if (templateIndex !== -1) {
                    const templateName = userTemplates[templateIndex].name;
                    
                    // 如果要删除的是当前使用的模板，则不允许删除
                    if (userTemplates[templateIndex].path === currentTemplate.path) {
                        showToast('无法删除正在使用的模板', 'warning');
                        speakText('无法删除正在使用的模板');
                        return;
                    }
                    
                    // 确认删除
                    if (confirm(`确定要删除模板"${templateName}"吗？`)) {
                        userTemplates.splice(templateIndex, 1);
                        saveUserTemplates();
                        updateTemplateGallery();
                        showToast(`模板"${templateName}"已删除`);
                        speakText(`模板${templateName}已删除`);
                    }
                }
            });
        });
    }
    
    // 打开模板选择模态框
    const openTemplateModalBtn = document.getElementById('openTemplateModal');
    if (openTemplateModalBtn) {
        openTemplateModalBtn.addEventListener('click', function() {
            updateTemplateGallery();
            
            // 检查模态框是否已存在
            let modalElement = document.getElementById('templateModalSelector');
            if (!modalElement) {
                // 创建模态框
                modalElement = document.createElement('div');
                modalElement.className = 'modal fade';
                modalElement.id = 'templateModalSelector';
                modalElement.tabIndex = '-1';
                modalElement.setAttribute('aria-hidden', 'true');
                
                // 模态框内容
                modalElement.innerHTML = `
                    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title"><i class="bx bx-images"></i> 选择检测模板</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row" id="templateGallery">
                                    <!-- 模板卡片将通过JavaScript动态添加 -->
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">关闭</button>
                                <a href="#upload-section" class="btn btn-primary" data-bs-dismiss="modal">添加新模板</a>
                            </div>
                        </div>
                    </div>
                `;
                
                // 添加到页面
                document.body.appendChild(modalElement);
            }
            
            // 显示模态框
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        });
    }

    // 打开语音帮助模态框
    const voiceHelpBtn = document.getElementById('voiceHelpBtn');
    if (voiceHelpBtn) {
        voiceHelpBtn.addEventListener('click', function() {
            // 检查模态框是否已存在
            let modalElement = document.getElementById('voiceHelpModal');
            if (!modalElement) {
                // 创建模态框
                modalElement = document.createElement('div');
                modalElement.className = 'modal fade';
                modalElement.id = 'voiceHelpModal';
                modalElement.tabIndex = '-1';
                modalElement.setAttribute('aria-hidden', 'true');
                
                // 模态框内容
                modalElement.innerHTML = `
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title"><i class="bx bx-microphone"></i> 语音命令帮助</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <div class="voice-help-list">
                                    <div class="voice-help-item">
                                        <h6><i class="bx bx-camera"></i> 开始检测</h6>
                                        <p>进入相机检测界面</p>
                                    </div>
                                    <div class="voice-help-item">
                                        <h6><i class="bx bx-search"></i> 寻找[物品名称]</h6>
                                        <p>开始寻找指定物品，例如"寻找水杯"</p>
                                    </div>
                                    <div class="voice-help-item">
                                        <h6><i class="bx bx-refresh"></i> 切换摄像头</h6>
                                        <p>在前置和后置摄像头之间切换</p>
                                    </div>
                                    <div class="voice-help-item">
                                        <h6><i class="bx bx-camera"></i> 拍照/截图</h6>
                                        <p>保存当前检测画面</p>
                                    </div>
                                    <div class="voice-help-item">
                                        <h6><i class="bx bx-message-detail"></i> 朗读结果</h6>
                                        <p>朗读当前的检测结果</p>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-primary" data-bs-dismiss="modal">我知道了</button>
                            </div>
                        </div>
                    </div>
                `;
                
                // 添加到页面
                document.body.appendChild(modalElement);
            }
            
            // 显示模态框
            const modal = new bootstrap.Modal(modalElement);
            modal.show();
        });
    }
});