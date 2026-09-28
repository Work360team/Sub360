// สะพานระหว่างหน้าเว็บกับแอป Windows — ตอนนี้ใช้แค่เรื่องอัปเดต (ดู setupUpdates ใน main.cjs)
//
// หน้าเว็บต้องเช็กว่ามี window.sub360App ก่อนใช้เสมอ: เปิดผ่านเบราว์เซอร์ธรรมดา (เริ่มโปรแกรม.bat) จะไม่มี
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sub360App", {
  updateState: () => ipcRenderer.invoke("sub360:update-state"),
  checkForUpdates: () => ipcRenderer.invoke("sub360:update-check"),
  installUpdate: () => ipcRenderer.invoke("sub360:update-install"),
  onUpdate(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("sub360:update", listener);
    return () => ipcRenderer.removeListener("sub360:update", listener);
  },
});
