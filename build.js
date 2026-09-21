/**
 * HBM Storytelling — Build Script
 * Bundles and obfuscates JavaScript, minifies CSS.
 * 
 * Usage: node build.js
 * 
 * Prerequisites:
 *   npm install terser javascript-obfuscator clean-css
 */

const fs = require('fs');
const path = require('path');

async function build() {
  console.log('🔨 HBM Build — Starting...\n');

  const buildDir = path.join(__dirname, 'build');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  // ---- 1. Bundle JavaScript ----
  console.log('📦 Bundling JavaScript...');

  const jsFiles = [
    'js/particles.js',
    'js/scale-dive.js',
    'js/scenes.js',
    'js/app.js',
  ];

  let bundledJS = '// HBM Interactive Experience — Bundled\n';
  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(__dirname, file), 'utf8');
    bundledJS += `\n// --- ${file} ---\n${content}\n`;
  }

  // ---- 2. Minify with Terser ----
  console.log('🗜️  Minifying with Terser...');
  let minifiedJS;
  try {
    const { minify } = require('terser');
    const terserResult = await minify(bundledJS, {
      compress: {
        drop_console: true,
        dead_code: true,
        passes: 2,
      },
      mangle: {
        toplevel: false,
      },
      output: {
        comments: false,
      },
    });
    minifiedJS = terserResult.code;
    console.log(`   Terser: ${bundledJS.length} → ${minifiedJS.length} bytes`);
  } catch (e) {
    console.warn('   ⚠️ Terser not available, skipping minification');
    minifiedJS = bundledJS;
  }

  // ---- 3. Obfuscate ----
  console.log('🔒 Obfuscating with javascript-obfuscator...');
  let obfuscatedJS;
  try {
    const JavaScriptObfuscator = require('javascript-obfuscator');
    const obfuscationResult = JavaScriptObfuscator.obfuscate(minifiedJS, {
      // High obfuscation settings
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.6,
      deadCodeInjection: true,
      deadCodeInjectionThreshold: 0.3,
      debugProtection: true,
      debugProtectionInterval: 2000,
      identifierNamesGenerator: 'hexadecimal',
      renameGlobals: false,        // Keep window.HBM accessible
      selfDefending: true,
      splitStrings: true,
      splitStringsChunkLength: 5,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      transformObjectKeys: true,
      unicodeEscapeSequence: false,
    });
    obfuscatedJS = obfuscationResult.getObfuscatedCode();
    console.log(`   Obfuscated: ${minifiedJS.length} → ${obfuscatedJS.length} bytes`);
  } catch (e) {
    console.warn('   ⚠️ javascript-obfuscator not available, skipping obfuscation');
    obfuscatedJS = minifiedJS;
  }

  fs.writeFileSync(path.join(buildDir, 'bundle.min.js'), obfuscatedJS);
  console.log('   ✅ build/bundle.min.js written');

  // ---- 4. Minify CSS ----
  console.log('🎨 Minifying CSS...');
  const cssContent = fs.readFileSync(path.join(__dirname, 'css/styles.css'), 'utf8');
  let minifiedCSS;
  try {
    const CleanCSS = require('clean-css');
    const cssResult = new CleanCSS({ level: 2 }).minify(cssContent);
    minifiedCSS = cssResult.styles;
    console.log(`   CSS: ${cssContent.length} → ${minifiedCSS.length} bytes`);
  } catch (e) {
    console.warn('   ⚠️ clean-css not available, skipping CSS minification');
    minifiedCSS = cssContent;
  }

  fs.writeFileSync(path.join(buildDir, 'styles.min.css'), minifiedCSS);
  console.log('   ✅ build/styles.min.css written');

  // ---- 5. Generate production HTML ----
  console.log('📄 Generating production HTML...');
  let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

  // Replace CSS link
  html = html.replace(
    '<link rel="stylesheet" href="css/styles.css">',
    '<link rel="stylesheet" href="build/styles.min.css">'
  );

  // Replace script tags with single bundle
  html = html.replace(
    /\s*<script src="js\/particles\.js"><\/script>\s*<script src="js\/scale-dive\.js"><\/script>\s*<script src="js\/scenes\.js"><\/script>\s*<script src="js\/app\.js"><\/script>/,
    '\n  <script src="build/bundle.min.js"></script>'
  );

  fs.writeFileSync(path.join(buildDir, 'index.html'), html);
  console.log('   ✅ build/index.html written');

  console.log('\n🎉 Build complete! Open build/index.html to see the production version.\n');
}

build().catch(console.error);
