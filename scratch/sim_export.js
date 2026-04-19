function runSim() {
  const mode = 'html';
  const langPrefix = 'vi/';
  const pages = [
      {path: '/giai-phap-av.php'},
      {path: '/chi-tiet-tin-tuc.php?slug=test'}
  ];
  
  pages.forEach(page => {
      let outputName;
      const cleanPath = page.path.replace(/^\//, '').replace(/\//g, '_');
      const hasExt = cleanPath.match(/\.(php|html|htm)$/i);
      const ext = mode === 'php' ? '.php' : '.html';
      outputName = `${langPrefix}${cleanPath}${hasExt ? '' : ext}`;
      console.log('Path:', page.path, '-> outputName:', outputName);
  });
}
runSim();
