const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const JSZip = require('jszip');
const os = require('os');

let win;

const args = process.argv.slice(1);
serve = args.some(val => val === 'local');


let baseDir;
let driveDir;
let confDir;
const home = process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
if (process.platform === 'darwin') {
  baseDir = path.join(home, 'Library', 'Application Support', 'EVE Online', 'p_drive',
    'Local Settings', 'Application Data', 'CCP', 'EVE', 'SharedCache',
    'wineenv', 'drive_c', 'users', os.userInfo().username, 'Local Settings',
    'Application Data', 'CCP', 'EVE');
} else if (process.platform === 'win32') {
  baseDir = path.join(home, 'AppData', 'Local', 'CCP', 'EVE');
}
let dir = baseDir;
const confFile = path.join(baseDir, 'lostui.conf');

ipcMain.on('getFiles', (event, arg) => {
  fs.readdir(dir, (err, data) => {
    win.webContents.send('getFilesResponse', data);
  });
});

ipcMain.on('getDataFiles', (event, arg) => {
  fs.readdir(path.join(baseDir, driveDir, confDir), (err, data) => {
    const files = (data ? data : [])
    .filter(file => /(core)_([a-z]{4})_([0-9]+)(\.dat)/.test(file))
    .map(file => ({
      profileName: confDir,
      fileName: file,
      id: /[0-9]+/.exec(file)[0],
      type: /(char)/.test(file) ? 0 : 1
    }));
    win.webContents.send('getDataFilesResponse', files);
  });
});

ipcMain.on('copyData', (event, arg) => {
  const pre = `core_${arg[0]}_`;
  const main = arg[1];
  const list = arg.slice(2, arg.length);
  let zip = new JSZip();
  list.forEach(function (str) {
    zip.file(`${pre}${str}.dat`, fs.readFileSync(path.join(dir, `${pre}${str}.dat`)));
  });
  if (!fs.existsSync(path.join(dir, 'backups'))) {
    fs.mkdirSync(path.join(dir, 'backups'));
  }
  zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
    .pipe(fs.createWriteStream(path.join(dir, 'backups', `${arg[0]}_${encodeDate(new Date().toISOString())}.zip`)))
    .on('finish', function () {
      list.forEach(function (str) {
        fs.copyFileSync(path.join(dir, `${pre}${main}.dat`), path.join(dir, `${pre}${str}.dat`));
      });
      win.webContents.send('copyDataResponse');
    });
});

ipcMain.on('copyBoth', (event, arg) => {
  const sChar = arg[0];
  const sAcc = arg[1];
  const cList = arg[2];
  const aList = arg[3];
  let zip = new JSZip();
  cList.forEach(function (str) {
    zip.file(`core_char_${str}.dat`, fs.readFileSync(path.join(dir, `core_char_${str}.dat`)));
  });
  aList.forEach(function (str) {
    zip.file(`core_user_${str}.dat`, fs.readFileSync(path.join(dir, `core_user_${str}.dat`)));
  });
  if (!fs.existsSync(path.join(dir, 'backups'))) {
    fs.mkdirSync(path.join(dir, 'backups'));
  }
  zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
    .pipe(fs.createWriteStream(path.join(dir, 'backups', `alls_${encodeDate(new Date().toISOString())}.zip`)))
    .on('finish', function () {
      cList.forEach(function (str) {
        fs.copyFileSync(path.join(dir, `core_char_${sChar}.dat`), path.join(dir, `core_char_${str}.dat`));
      });
      aList.forEach(function (str) {
        fs.copyFileSync(path.join(dir, `core_user_${sAcc}.dat`), path.join(dir, `core_user_${str}.dat`));
      });
      win.webContents.send('copyBothResponse');
    });
});

ipcMain.on('resetToBaseDir', (event, arg) => {
  dir = baseDir;
  win.webContents.send('resetToBaseDirResponse');
});

ipcMain.on('selectDrive', (event, arg) => {
  driveDir = arg;
  dir = path.join(baseDir, driveDir);
  win.webContents.send('selectDriveResponse');
});

ipcMain.on('selectProfile', (event, arg) => {
  confDir = arg;
  dir = path.join(baseDir, driveDir, confDir);
  win.webContents.send('selectProfileResponse', `${driveDir}/${confDir}`);
});

ipcMain.on('getBackups', (event, arg) => {
  fs.readdir(path.join(dir, 'backups'), (err, data) => {
    win.webContents.send('getBackupsResponse', data);
  })
});

ipcMain.on('getBackupInfo', (event, arg) => {
  fs.readFile(path.join(dir, 'backups', arg), (err, data) => {
    JSZip.loadAsync(data).then((zip) => {
      const files = Object.keys(zip.files).map(file => ({
        location: `${driveDir}/${confDir}`,
        fileName: file,
        id: /[0-9]+/.exec(file)[0],
        type: /(char)/.test(file) ? 0 : 1
      }));
      win.webContents.send('getBackupInfoResponse', files);
    });
  });
});

ipcMain.on('restoreBackup', (event, arg) => {
  fs.readFile(path.join(dir, 'backups', arg), (err, data) => {
    JSZip.loadAsync(data).then((zip) => {
      Object.keys(zip.files).forEach((file) => {
        zip.file(file).async("nodebuffer").then((val) => {
          const stream = fs.createWriteStream(path.join(dir, file));
          stream.write(val);
          stream.end();
        });
      });
      fs.unlinkSync(path.join(dir, 'backups', arg));
      win.webContents.send('restoreBackupResponse', data);
    });
  });
});

ipcMain.on('getImports', (event, arg) => {
  allFileData = [];
  fs.readdir(path.join(baseDir, driveDir), (err, data) => {
    data.filter((val) => /(settings)/.test(val)).forEach((val) => {
      files = fs.readdirSync(path.join(baseDir, driveDir, val)).filter((val) => /(core)_([a-z]{4})_([0-9]+)/.test(val));
      const fileData = files.map((file) => ({
        profileName: val,
        fileName: file,
        id: /[0-9]+/.exec(file)[0],
        type: /(char)/.test(file) ? 0 : 1
      }));
      allFileData.push(...fileData);
    });
    win.webContents.send('getImportsResponse', allFileData);
  });
});

ipcMain.on('importData', (event, arg) => {
  arg.forEach((val) => {
    fs.copyFileSync(path.join(baseDir, driveDir, val.profileName, val.fileName), path.join(baseDir, driveDir, confDir, val.fileName))
  });
  win.webContents.send('importDataResponse');
});

ipcMain.on('getLatestAccount', (event, arg) => {
  fs.readdir(dir, (err, files) => {
    const accFiles = files.filter(file => /(user)/.test(file));
    let lastModifiedFile;
    accFiles.forEach(file => {
      const fileLastModified = fs.statSync(path.join(dir, file)).mtime;
      if (!lastModifiedFile) {
        lastModifiedFile = {
          date: fileLastModified,
          account: /[0-9]+/.exec(file)[0]
        };
      } else if (fileLastModified > lastModifiedFile.date) {
        lastModifiedFile = {
          date: fileLastModified,
          account: /[0-9]+/.exec(file)[0]
        };
      }
    });
    win.webContents.send('getLatestAccountResponse', lastModifiedFile.account);
  });
});

ipcMain.on('setLinkedAccount', (event, arg) => {
  if (!fs.existsSync(confFile)) {
    fs.writeFileSync(confFile, JSON.stringify([], null, 2));
  }
  var data = JSON.parse(fs.readFileSync(confFile));
  if(!data.find(val => val.accId === arg[0])) {
    data.push({
      accId: arg[0],
      charIds: arg.slice(1)
    });
  } else {
    data.find(val => val.accId === arg[0]).charIds = arg.slice(1);
  }
  fs.writeFileSync(confFile, JSON.stringify(data, null, 2));
  win.webContents.send('setLinkedAccountResponse');
});

ipcMain.on('getLinkedAccounts', (event, arg) => {
  if (!fs.existsSync(confFile)) {
    fs.writeFileSync(confFile, JSON.stringify([], null, 2));
  }
  win.webContents.send('getLinkedAccountsResponse', JSON.parse(fs.readFileSync(confFile)));
});

const encodeDate = (date) => {
  const main = date.split("T");
  const one = main[0].split("-").join("");
  const two = main[1].split(".")[0].split(":").join("")
  return one + '-' + two;
}

const createWindow = () => {
  win = new BrowserWindow({
    width: 1200,
    height: 1200,
    webPreferences: {
      nodeIntegration: true
    }
  });

  if (serve) {
    win.loadURL('http://localhost:4200');
    win.webContents.openDevTools();
  } else {
    win.loadURL(url.format({
      pathname: path.join(__dirname, 'dist/index.html'),
      protocol: 'file:',
      slashes: true
    }));
  }
  win.on('closed', () => {
    win = null;
  });
}

app.on('ready', createWindow);

// on macOS, closing the window doesn't quit the app
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// initialize the app's main window
app.on('activate', () => {
  if (win === null) {
    createWindow();
  }
});
