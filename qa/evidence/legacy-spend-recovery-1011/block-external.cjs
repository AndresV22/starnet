const originalFetch=globalThis.fetch;
globalThis.fetch=(url,...rest)=>{const u=new URL(typeof url==='string'?url:url.url||String(url));if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))return Promise.reject(new Error('fixture blocks external network'));return originalFetch(url,...rest)};
