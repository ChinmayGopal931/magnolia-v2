const esbuild = require('esbuild');
const path = require('path');

// Build configuration
const buildOptions = {
  entryPoints: ['./dist/lambda/api-handler.js'],
  bundle: true,
  outfile: '.aws-sam/build/lambda-bundle.js',
  platform: 'node',
  target: 'node18',
  external: [
    'aws-sdk', // Provided by Lambda runtime
    '@aws-sdk/*', // AWS SDK v3 modules
  ],
  minify: true,
  sourcemap: false,
  metafile: true,
  format: 'cjs', // Use CommonJS for Lambda
  banner: {
    js: `
const require = (await import("node:module")).createRequire(import.meta.url);
const __filename = (await import("node:url")).fileURLToPath(import.meta.url);
const __dirname = (await import("node:path")).dirname(__filename);
`
  }
};

// Run build
async function build() {
  try {
    console.log('Building Lambda bundle...');
    const result = await esbuild.build(buildOptions);
    
    // Analyze bundle size
    const text = await esbuild.analyzeMetafile(result.metafile, {
      verbose: false,
    });
    console.log('Bundle analysis:');
    console.log(text);
    
    console.log('Bundle created successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();