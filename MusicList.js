const fs = require('fs');
const path = require('path');

// ======================== 全局配置 ========================

// 嗅探深度（0=只当前目录，1=一层子目录，2=两层...）
const SNIFF_DEPTH = 3;

// 标题来源：
// true  -> 使用音频 metadata.title
// false -> 使用文件名
const USE_METADATA_TITLE = false;

// 文件夹配置
// 只需要写需要生成列表的根目录名
// 可选设置 overrideArtist / 子目录覆盖
const config = {
    '文件夹名': {
        // 整个目录强制作者（可选）
        overrideArtist: null,
        // 子目录作者覆盖（可选）
        folderArtistMap: {
            // 'OST1': 'Stafford Bawler'
        }
    },
};
// 音频文件扩展
const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

/** 清理曲目名 */
function cleanTrackName(filename) {
    return path.parse(filename).name;
}

function formatPlaylistForJSON(playlist) {
    return `"Files": [\n    ${
        playlist
            .map(item => JSON.stringify(item))
            .join(',\n    ')
    }\n]`;
}

/**
 * 生成playList，支持子文件夹自动章节/自定义章节/无章节
 * @param {string} gameDir - 根目录名
 */
function scanAudioFiles(dir, depth, currentDepth = 0) {
    if (currentDepth > depth) return [];

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let results = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            results = results.concat(
                scanAudioFiles(fullPath, depth, currentDepth + 1)
            );
        } else if (entry.isFile()) {
            if (audioExtensions.includes(path.extname(entry.name).toLowerCase())) {
                results.push(fullPath);
            }
        }
    }

    return results;
}

const mm = require('music-metadata');

async function readMetadata(filePath) {
    try {
        const metadata = await mm.parseFile(filePath);

        return {
            title: metadata.common.title || null,
            artist: metadata.common.artist || null
        };
    } catch (err) {
        return { title: null, artist: null };
    }
}

async function generatePlaylist(gameDir) {
    const apiPath = path.join(__dirname, 'source/api', gameDir);

    if (!fs.existsSync(apiPath)) {
        console.log(`目录不存在: ${apiPath}`);
        return [];
    }

    const folderConfig = config[gameDir] || {};
    const overrideArtist = folderConfig.overrideArtist || null;
    const folderArtistMap = folderConfig.folderArtistMap || {};

    const files = scanAudioFiles(apiPath, SNIFF_DEPTH);

    // 按第一层目录分组
    const grouped = {};

    for (const fullPath of files) {
        const relativePath = path.relative(apiPath, fullPath).replace(/\\/g, '/');
        const parts = relativePath.split('/');
        const firstFolder = parts.length > 1 ? parts[0] : null;

        if (!grouped[firstFolder || '__root__']) {
            grouped[firstFolder || '__root__'] = [];
        }

        grouped[firstFolder || '__root__'].push({
            fullPath,
            relativePath,
            firstFolder
        });
    }

    let playlist = [];

    for (const groupName of Object.keys(grouped)) {

        // 插入章节（root 不插）
        if (groupName !== '__root__') {
            playlist.push({
                type: 'chapter',
                title: groupName
            });
        }

        for (const fileObj of grouped[groupName]) {
            const metadata = await readMetadata(fileObj.fullPath);

            const finalTitle =
                USE_METADATA_TITLE && metadata.title
                    ? metadata.title
                    : cleanTrackName(path.basename(fileObj.fullPath));

            let finalArtist =
                overrideArtist ||
                folderArtistMap[fileObj.firstFolder] ||
                metadata.artist ||
                '-';

            playlist.push({
                path: `/api/${gameDir}/${fileObj.relativePath}`,
                name: finalTitle,
                artist: finalArtist
            });
        }
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

async function generateAllPlaylists() {
    for (const gameDir of Object.keys(config)) {
        console.log(`\n=== ${gameDir} ===`);

        const playlist = await generatePlaylist(gameDir);

        if (playlist.length > 0) {

            // ========= JS 输出 =========
            const jsOutput = formatPlaylistForJS(playlist);
            const jsFile = `${gameDir.replace(/\s+/g, '_')}_playlist.js`;
            fs.writeFileSync(jsFile, jsOutput);

            // ========= JSON 输出 =========
            const jsonOutput = formatPlaylistForJSON(playlist);
            const jsonFile = `${gameDir.replace(/\s+/g, '_')}_playlist.json`;
            fs.writeFileSync(jsonFile, jsonOutput);

            console.log(`已生成:`);
            console.log(`  - ${jsFile}`);
            console.log(`  - ${jsonFile}`);

        } else {
            console.log('未找到音频文件');
        }

        console.log('\n' + '='.repeat(50));
    }
}

if (require.main === module) {
    generateAllPlaylists();
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

module.exports = { generatePlaylist, formatPlaylistForJS, cleanTrackName };