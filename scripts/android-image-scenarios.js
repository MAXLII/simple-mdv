(async () => {
  const $ = id => document.getElementById(id);
  if ($('document-name').textContent !== '阅读验收.md') throw new Error('Only the dedicated fixture may be edited');
  if ($('editor').hidden) { $('edit').click(); await new Promise(resolve => setTimeout(resolve, 100)); }
  const image = '/sdcard/Documents/SimpleMDV-Test-20260912/图片/示意%20图.svg';
  const section = '\n\n## 全部文件权限图片验收\n\n![验收相对图片](图片/示意%20图.svg)\n\n![验收绝对图片](' + image + ')\n\n![验收file图片](file://' + image + ')\n';
  if (!$('editor').value.includes('全部文件权限图片验收')) $('editor').value += section;
  $('editor').dispatchEvent(new Event('input')); await window.androidApp.checkpoint();
  const start = Date.now(); let images;
  do {
    images = [...document.querySelectorAll('#viewer img')].filter(image => image.alt.startsWith('验收'));
    if (images.length === 3 && images.every(image => image.naturalWidth > 0)) break;
    if (Date.now() - start > 15000) throw new Error(JSON.stringify(images.map(image => ({ alt: image.alt, src: image.src }))));
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (true);
  return { permission: $('all-files').textContent, images: images.map(image => ({ name: image.alt, width: image.naturalWidth, height: image.naturalHeight, usesBlob: image.src.startsWith('blob:') })), draftReady: $('editor').value.includes('RECOVERY-20260912') };
})()
