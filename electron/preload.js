// 화면(렌더러)에 내놓는 기능. 토큰·세션·파일·Node는 주지 않고, 필요한 일은 앱 본체(main)가 대신 해 줌
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (ch, v) => ipcRenderer.invoke(ch, v);
contextBridge.exposeInMainWorld('puyoApp', {
  isApp: true,
  info: () => call('app:info'),
  setServer: url => call('app:setServer', String(url)),
  register: (id, name, pw) => call('auth:register', { id: String(id), name: String(name), pw: String(pw) }),
  login: (id, pw) => call('auth:login', { id: String(id), pw: String(pw) }),
  logout: () => call('auth:logout'),
  logoutAll: () => call('auth:logoutAll'),
  changePassword: (oldPw, newPw) => call('auth:password', { old: String(oldPw), new: String(newPw) }),
  ticket: () => call('auth:ticket'),
  api: (path, params) => call('api:get', { path: String(path), params: params && typeof params === 'object' ? params : {} }),
  onMenu: cb => { if (typeof cb === 'function') ipcRenderer.on('menu', (_e, what) => cb(String(what))); },
});
