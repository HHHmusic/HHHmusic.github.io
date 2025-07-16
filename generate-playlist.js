const fs = require('fs');
const path = require('path');

// 配置信息
const config = {
    'Terraria': 'James Hannigan',
    'Terraria Otherworld': 'Scott Lloyd Shelley',
    'Starbound': 'Curtis Schweitzer'
};

// 音频文件扩展名
const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

function cleanTrackName(filename) {
    // 移除文件扩展名
    let name = path.parse(filename).name;
    
    // 移除前缀模式如 "1-01. ", "2-01. ", "01. ", "1. " 等
    name = name.replace(/^\d+-\d+\.\s*/, ''); // 匹配 "1-01. "
    name = name.replace(/^\d+\.\s*/, '');     // 匹配 "01. "
    name = name.replace(/^\d+\s*-\s*/, '');   // 匹配 "01 - "
    
    return name.trim();
}

function generatePlaylist(gameDir) {
    const apiPath = path.join(__dirname, 'api', gameDir);
    
    if (!fs.existsSync(apiPath)) {
        console.log(`目录不存在: ${apiPath}`);
        return [];
    }
    
    const files = fs.readdirSync(apiPath);
    const audioFiles = files.filter(file => 
        audioExtensions.includes(path.extname(file).toLowerCase())
    );
    
    // 按文件名排序
    audioFiles.sort();
    
    const playlist = audioFiles.map(file => {
        const cleanName = cleanTrackName(file);
        return {
            path: `/api/${gameDir}/${file}`,
            name: cleanName,
            artist: config[gameDir]
        };
    });
    
    return playlist;
}

function formatPlaylistForJS(playlist) {
    const items = playlist.map(track => {
        return `            { path: '${track.path}', name: '${track.name}', artist: '${track.artist}' }`;
    });
    
    return `        const playlist = [
${items.join(',\n')}
        ];`;
}

// 生成所有游戏的播放列表
function generateAllPlaylists() {
    Object.keys(config).forEach(gameDir => {
        console.log(`\n=== ${gameDir} ===`);
        const playlist = generatePlaylist(gameDir);
        
        if (playlist.length > 0) {
            console.log(`找到 ${playlist.length} 个音频文件`);
            console.log('\n生成的播放列表代码：');
            console.log(formatPlaylistForJS(playlist));
            
            // 可选：保存到文件
            const outputFile = `${gameDir.replace(/\s+/g, '_')}_playlist.js`;
            fs.writeFileSync(outputFile, formatPlaylistForJS(playlist));
            console.log(`\n已保存到文件: ${outputFile}`);
        } else {
            console.log('未找到音频文件');
        }
        console.log('\n' + '='.repeat(50));
    });
}

// 如果直接运行此脚本
if (require.main === module) {
    generateAllPlaylists();
}

module.exports = { generatePlaylist, formatPlaylistForJS, cleanTrackName };