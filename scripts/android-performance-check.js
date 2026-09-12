// Run against the debug APK using android-device-check.mjs --file.
// Uses only the dedicated fixture directory already pushed to the tablet.
(async () => {
  const wait = async predicate => {
    const deadline = Date.now() + 20000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error('Fixture UI timed out');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const tree = name => [...document.querySelectorAll('.tree-item')].find(b => b.textContent.trim().endsWith(name));
  for (const name of ['Documents', 'SimpleMDV-Test-20260912']) {
    await wait(() => tree(name));
    if (tree(name).textContent.includes('▸')) tree(name).click();
  }
  const results = [];
  for (const name of ['大文档.md', '复杂流程图.md']) {
    await wait(() => tree(name));
    const started = performance.now();
    tree(name).click();
    await wait(() => document.querySelector('#status').textContent.startsWith(name) && document.querySelector('#status').textContent.includes('ms'));
    results.push({name, elapsedMs: Math.round(performance.now() - started), status: document.querySelector('#status').textContent,
      headings: document.querySelectorAll('#viewer h1,#viewer h2').length, diagrams: document.querySelectorAll('#viewer .mermaid-wrapper svg').length,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1});
  }
  return results;
})()
