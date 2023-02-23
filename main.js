const Fs = require('fs');
const Path = require('path');
const recruse = require('recurse');
const { v4: uuid } = require('uuid');
const prompt = require('prompt-sync')();
const MusicMetadata = require('music-metadata');
const { removeDiacriticalMarks } = require('remove-diacritical-marks')

const folderToScan = process.argv[2] ?? process.env.FOLDER_TO_SCAN ?? process.cwd();

let startAnswer = null;
    while (startAnswer !== 'yes') {
        console.info(`ℹ️ The following directory will be scanned for duplicate audio files:: ${folderToScan}`);

        startAnswer = prompt('❓ Would you like to continue? (yes/no) ');
        if (startAnswer?.toLowerCase() === 'no') {
            process.exit(0);
        } else if (startAnswer !== 'yes') {
            console.warn('⚠️ Invalid answer. Type "yes" to continue, or "no" to exit.');
        }

        console.log('');
    }

const audioFilesMap = {};

const filter = (path, stat) => {
	if (stat.isDirectory()) {
		console.log(`📂 ${path}`);
		return false;
	}
	
	return path.match(/\.(mp3|flac|wav|ogg|m4a)$/i);
}

const parseTags = file => MusicMetadata.parseFile(file).then(x => x?.common);
const parseTasks = [];

console.info('⏳ Scanning folder...');

recruse(folderToScan, {writefilter: filter}).on('data', file => {
	console.log(`📄 ${file}`);
	
	parseTasks.push(() => new Promise((resolve, reject) => {
		parseTags(file)
			.then(tags => {
                const filenameWithoutExtension = Path.parse(file).name;
                const id3Artist = tags?.['artist'];
                const id3Title = tags?.['title'];

                const key = (id3Artist && id3Title)
                    ? `${removeDiacriticalMarks(id3Artist)} - ${removeDiacriticalMarks(id3Title)}`
                    : removeDiacriticalMarks(filenameWithoutExtension);
                const song = (id3Artist && id3Title)
                    ? `${id3Artist} - ${id3Title}`
                    : filenameWithoutExtension;

                if (audioFilesMap?.[key] === undefined) {
                    audioFilesMap[key] = [];
                }
                audioFilesMap[key].push(file);

				console.log(`🎵 ${song}`);
			})
			.catch(err => {
				console.error(`🛑 Failed to process file: ${file}`);
				console.error(err);
			})
			.then(resolve);
	}));
}).on('end', async () => {
	console.info('ℹ️ Scan complete.');
	
	console.info('⏳ Parsing files...');
	for (const parseTask of parseTasks) {
		await parseTask();
	}
	console.info('ℹ️ Parsing complete.');

    console.info('⏳ Scanning for duplicates...');
    const filesThatHaveDuplicates = Object.fromEntries(Object.entries(audioFilesMap).filter(([key, files]) => files.length > 1));
    console.info('ℹ️ Scanning for duplicates complete.');

    if (filesThatHaveDuplicates.length === 0) {
        console.info('ℹ️ No duplicates found. Press enter to exit the program.');
        prompt();
        process.exit(0);
        return;
    }
	
	console.info('⏳ Converting data into CSV...');
    const EMPTY_CSV_ROW = '"",""';
    const csvHeader = '"Song","File"';
	const csvData = Object.keys(filesThatHaveDuplicates).map(key => {
        const files = filesThatHaveDuplicates[key];
        const filesEscaped = files.map(file => file.replace(/\"\'\n\r/, ''));

        return filesEscaped.map(file => `"${key}","${file}"`);
    }).map(rows => [...rows, EMPTY_CSV_ROW]).flatMap(x => x);
    const csv = [csvHeader, EMPTY_CSV_ROW, ...csvData].join('\n');
	
	console.info('⏳ Writing data to file: duplicates.csv');
	Fs.writeFileSync('duplicates.csv', csv);
	
	console.info('✅ Done!');
	console.info('ℹ️ Press enter to exit the programme.');
	prompt();
});