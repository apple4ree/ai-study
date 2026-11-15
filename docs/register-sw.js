if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', {scope:'./',updateViaCache:'none'});
      const ready = await navigator.serviceWorker.ready;
      const notify = () => window.dispatchEvent(new CustomEvent('offline-ready'));
      if (navigator.serviceWorker.controller) notify();
      else navigator.serviceWorker.addEventListener('controllerchange',notify,{once:true});
      if (ready.active) notify();
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='activated')notify();});});
    } catch(e) {
      console.warn('오프라인 저장을 사용할 수 없습니다.',e);
    }
  });
}
