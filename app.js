// app.js - 纯净修复版
document.addEventListener('DOMContentLoaded', () => {
    console.log("应用已启动，正在初始化...");

    // 1. 获取页面元素 (增加了空值检查，防止报错卡死)
    const inputA = document.getElementById('input-a');
    const inputB = document.getElementById('input-b');
    const compareBtn = document.getElementById('compare-btn');
    const resultArea = document.getElementById('result-area');

    // 如果找不到核心元素，直接停止，不再报错
    if (!inputA || !inputB || !compareBtn) {
        console.error("错误：找不到输入框或按钮，请检查HTML中的ID是否正确。");
        return; 
    }

    // 2. 定义对比功能
    async function handleCompare() {
        const textA = inputA.value.trim();
        const textB = inputB.value.trim();

        // 简单校验
        if (!textA || !textB) {
            alert("请在两个输入框中都填入药品说明书内容！");
            return;
        }

        // UI 状态更新：开始加载
        const originalBtnText = compareBtn.innerText;
        compareBtn.innerText = "正在智能分析中...";
        compareBtn.disabled = true;
        compareBtn.style.opacity = "0.6";
        resultArea.innerHTML = '<div style="text-align:center; padding:20px;">⏳ 正在连接服务器分析差异，请稍候...</div>';

        try {
            // 3. 发送请求给后端 (假设你的后端接口是 /api/compare)
            // 注意：如果你的 server.js 里接口名字不一样，请修改下面这个 URL
            const response = await fetch('/api/compare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ textA, textB })
            });

            if (!response.ok) {
                throw new Error(`服务器响应错误: ${response.status}`);
            }

            const data = await response.json();
            
            // 4. 显示结果
            // 假设后端返回的数据在 data.result 或 data.diff 中
            // 如果后端返回格式不同，这里需要微调
            resultArea.innerHTML = `<div class="result-content">${data.result || data.diff || JSON.stringify(data)}</div>`;

        } catch (error) {
            console.error("对比失败:", error);
            resultArea.innerHTML = `<div style="color:red; text-align:center;">❌ 分析失败: ${error.message}<br>请检查服务器是否正常运行。</div>`;
        } finally {
            // 恢复按钮状态
            compareBtn.innerText = originalBtnText;
            compareBtn.disabled = false;
            compareBtn.style.opacity = "1";
        }
    }

    // 5. 绑定点击事件
    compareBtn.addEventListener('click', handleCompare);
    
    console.log("初始化完成，等待用户操作。");
});
