/**
 * 搜索功能JS
*/
(function() {
    let searchData = null;
    const searchInput = document.querySelector('.search-modal-input');
    const searchResult = document.getElementById('searchResult');

    async function initData() {
        if (searchData) return;
        try {
            const res = await fetch('/api/search.json');
            searchData = await res.json();
        } catch (e) {
            console.error("搜索数据加载失败", e);
        }
    }

    function doSearch(keyword) {
        if (!searchData || !searchResult) return;
        
        const query = keyword.trim().toLowerCase();
        searchResult.innerHTML = '';

        if (query === '') return;

        const filtered = searchData.filter(item => 
            (item.title || '').toLowerCase().includes(query) || 
            (item.brief || '').toLowerCase().includes(query) ||
            (item.play || '').toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            searchResult.innerHTML = '<div style="padding:20px;color:#999">未找到相关结果</div>';
            return;
        }

        filtered.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = "15px 0";
            div.style.borderBottom = "1px solid #eee";
            let finalUrl = item.play;
            if (!finalUrl.includes('?') && !finalUrl.includes('#') && !finalUrl.endsWith('/')) {
                finalUrl += '/';
            }

        div.innerHTML = `
                <div style="margin-bottom: 5px;">
                    <a href="${finalUrl}" style="color:#42b983; text-decoration:none; font-size:18px; font-weight:600;">
                        ${highlight(item.title || '', query)}
                    </a>
                </div>
                <div style="font-size:14px; color:#666; line-height:1.5; margin-bottom:5px;">
                    ${highlight(item.brief || '', query)}
                </div>
                <div style="font-size:12px; color:#bbb;">
                    <i class="far fa-calendar-alt"></i> ${item.pubDate || ''}
                </div>
            `;
            searchResult.appendChild(div);
        });
    }

    function highlight(text, key) {
        if (!text) return "";
        const regex = new RegExp(`(${key})`, 'gi');
        return text.replace(regex, '<span style="background:#fff3cd; color:#ff5722; padding:0 2px;">$1</span>');
    }

    if (searchInput) {
        searchInput.addEventListener('focus', initData);
        searchInput.addEventListener('input', (e) => doSearch(e.target.value));
    }
})();