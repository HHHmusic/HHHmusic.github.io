const fs = require('fs');
const path = require('path');

// 游戏-作者映射
const config = {
    'Red Alert 2': 'Frank Klepacki',
};
// 音频文件扩展
const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

/** 清理曲目名 */
function cleanTrackName(filename) {
    let name = path.parse(filename).name;
    name = name.replace(/^\d+-\d+\.\s*/, '');
    name = name.replace(/^\d+\.\s*/, '');
    name = name.replace(/^\d+\s*-\s*/, '');
    return name.trim();
}

/**
 * 生成playList，支持子文件夹自动章节/自定义章节/无章节
 * @param {string} gameDir - 根目录名
 */
function generatePlaylist(gameDir) {
    const apiPath = path.join(__dirname, 'api', gameDir);
    // 取得章节/分组控制参数
    let artist = typeof config[gameDir] === 'string' ? config[gameDir] : '-';
    let ignoreChapter = false, chapterMap = {};
    if (typeof config[gameDir] === 'object') {
        artist = config[gameDir].artist || '-';
        ignoreChapter = !!config[gameDir].ignoreChapter;
        chapterMap = config[gameDir].chapterMap || {};
    }

    if (!fs.existsSync(apiPath)) {
        console.log(`目录不存在: ${apiPath}`);
        return [];
    }

    // 是否有子目录
    const entries = fs.readdirSync(apiPath, { withFileTypes: true });
    const subFolderList = entries.filter(ent => ent.isDirectory()).map(ent => ent.name);

    let playlist = [];

    // 有子文件夹, 并未被ignore章节
    if (subFolderList.length > 0 && !ignoreChapter) {
        // 每个子文件夹作为章节
        subFolderList.forEach(subFolder => {
            // 章节名可映射
            let chapterName = chapterMap[subFolder] || subFolder;
            playlist.push({ type: 'chapter', title: chapterName });

            const subDirFull = path.join(apiPath, subFolder);
            let files = fs.readdirSync(subDirFull);
            // 只选音频文件
            files = files.filter(f => audioExtensions.includes(path.extname(f).toLowerCase()));
            files.sort();
            // 章节下每首歌
            files.forEach(file => {
                const cleanName = cleanTrackName(file);
                playlist.push({
                    path: `/api/${gameDir}/${subFolder}/${file}`,
                    name: cleanName,
                    artist
                });
            });
        });
    } else {
        // 无子文件夹，或主动ignore章节
        let files = entries.filter(ent => ent.isFile()).map(ent => ent.name)
            .filter(f => audioExtensions.includes(path.extname(f).toLowerCase()));
        files.sort();
        files.forEach(file => {
            const cleanName = cleanTrackName(file);
            playlist.push({
                path: `/api/${gameDir}/${file}`,
                name: cleanName,
                artist
            });
        });
    }
    return playlist;
}

/** 渲染js数组文本 */
function formatPlaylistForJS(playlist) {
    const items = playlist.map(item => {
        if (item.type === 'chapter') {
            return `            { type: 'chapter', title: ${JSON.stringify(item.title)} }`;
        } else {
            return `            { path: ${JSON.stringify(item.path)}, name: ${JSON.stringify(item.name)}, artist: ${JSON.stringify(item.artist)} }`;
        }
    });
    return `        const playlist = [
${items.join(',\n')}
        ];`;
}

function generateAllPlaylists() {
    Object.keys(config).forEach(gameDir => {
        console.log(`\n=== ${gameDir} ===`);
        const playlist = generatePlaylist(gameDir);

        if (playlist.length > 0) {
            console.log(`找到 ${playlist.filter(o => !o.type).length} 个音频文件`);
            console.log('\n生成的播放列表代码：');
            console.log(formatPlaylistForJS(playlist));

            const outputFile = `${gameDir.replace(/\s+/g, '_')}_playlist.js`;
            fs.writeFileSync(outputFile, formatPlaylistForJS(playlist));
            console.log(`\n已保存到文件: ${outputFile}`);
        } else {
            console.log('未找到音频文件');
        }
        console.log('\n' + '='.repeat(50));
    });
}

// ## 配置用法说明
// 假设有目录结构：  
// ```
// api/
//   Kingdom Two Crowns/
//     OST1/
//        01.mp3
//        02.mp3
//     OST2/
//        03.mp3
//     Misc/
//        04.mp3
// ```
// ### 默认效果
// ```js
// const config = {
//     'Kingdom Two Crowns': 'Andreas Hald'
// }
// ```
// 章节名为“OST1”“OST2”“Misc”，不映射。  

// ### 自定义章节名
// ```js
// const config = {
//     'Kingdom Two Crowns': {
//         artist: 'Andreas Hald',
//         chapterMap: { 'OST1': '原声集1', 'OST2': '原声集2', 'Misc': '其他' }
//     }
// }
// ```

// ### 忽略章节——所有音频直接铺平无分区
// ```js
// const config = {
//     'Kingdom Two Crowns': { artist: 'Andreas Hald', ignoreChapter: true }
// }
// ```

if (require.main === module) {
    generateAllPlaylists();
}

module.exports = { generatePlaylist, formatPlaylistForJS, cleanTrackName };