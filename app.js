// app.js - 药品对比助手核心逻辑

document.addEventListener('DOMContentLoaded', () => {
    console.log("应用已启动");

    // 1. 获取页面元素
    const compareBtn = document.getElementById('compare-btn');
    const inputA = document.getElementById('drug-a-text');
    const inputB = document.getElementById('drug-b-text');
    const resultSection = document.getElementById('result-section');
    const loadingIndicator = document.getElementById('loading-indicator');
    const analysisResult = document.getElementById('analysis-result');
    const initialLoading = document.getElementById('initial-loading');

    // 隐藏初始加载动画
    if (initialLoading) {
        initialLoading.style.display = 'none';
    }

    // 2. 绑定点击事件
    if (compareBtn) {
        compareBtn.addEventListener('click', async () => {
            const textA = inputA ? inputA.value.trim() : '';
            const textB = inputB ? inputB.value.trim() : '';

            if (!textA || !textB) {
                alert('请在两个输入框中都填入药品说明书内容！');
                return;
            }

            // UI 状态更新：开始加载
            compareBtn.innerText = "分析中...";
            compareBtn.disabled = true;
            resultSection.style.display = 'block';
            loadingIndicator.style.display = 'block';
            analysisResult.innerHTML = '';

            try {
                // 3. 发送请求给后端
                const response = await fetch('/api/compare', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ textA, textB })
                });

                const data = await response.json();

                if (response.ok) {
                    // 4. 显示结果
                    analysisResult.innerHTML = `<pre>${data.result || '分析完成，但未返回具体内容。'}</pre>`;
                } else {
                    analysisResult.innerHTML = `<p style="color:red;">错误: ${data.error || '分析失败'}</p>`;
                }
            } catch (error) {
                console.error("请求失败:", error);
                analysisResult.innerHTML = `<p style="color:red;">网络请求失败，请检查控制台。</p>`;
            } finally {
                // 恢复按钮状态
                loadingIndicator.style.display = 'none';
                compareBtn.innerText = "🚀 开始智能对比";
                compareBtn.disabled = false;
            }
        });
    }
});

// 以下是页面交互功能
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function saveSettings() {
    const apiKey = document.getElementById('api-key').value;
    const apiBase = document.getElementById('api-base').value;
    const modelName = document.getElementById('model-name').value;
    
    localStorage.setItem('api_key', apiKey);
    localStorage.setItem('api_base', apiBase);
    localStorage.setItem('model_name', modelName);
    
    alert('配置已保存！');
    toggleSettings();
}

function switchTab(tabName) {
    const textMode = document.getElementById('text-input-mode');
    const fileMode = document.getElementById('file-input-mode');
    const tabBtns = document.querySelectorAll('.tab-btn');

    if (tabName === 'text') {
        textMode.classList.add('active');
        fileMode.classList.remove('active');
        tabBtns[0].classList.add('active');
        tabBtns[1].classList.remove('active');
    } else {
        textMode.classList.remove('active');
        fileMode.classList.add('active');
        tabBtns[0].classList.remove('active');
        tabBtns[1].classList.add('active');
    }
}

// 页面加载时读取配置
window.onload = function() {
    document.getElementById('api-key').value = localStorage.getItem('api_key') || '';
    document.getElementById('api-base').value = localStorage.getItem('api_base') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    document.getElementById('model-name').value = localStorage.getItem('model_name') || 'qwen-plus';
};
