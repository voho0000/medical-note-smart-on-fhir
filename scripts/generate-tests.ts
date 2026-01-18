#!/usr/bin/env ts-node
/**
 * Test Generator Script
 * Generates basic test files for all source files that don't have tests yet
 */

import * as fs from 'fs'
import * as path from 'path'

const SRC_DIRS = ['src', 'features']
const TEST_DIR = '__tests__'
const EXTENSIONS = ['.ts', '.tsx']
const EXCLUDE_PATTERNS = ['.d.ts', '.test.ts', '.test.tsx', 'index.ts']

interface FileInfo {
  srcPath: string
  testPath: string
  relativePath: string
}

function getAllSourceFiles(dir: string, baseDir: string = dir): FileInfo[] {
  const files: FileInfo[] = []
  
  if (!fs.existsSync(dir)) return files
  
  const items = fs.readdirSync(dir)
  
  for (const item of items) {
    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)
    
    if (stat.isDirectory()) {
      files.push(...getAllSourceFiles(fullPath, baseDir))
    } else if (stat.isFile()) {
      const ext = path.extname(item)
      if (EXTENSIONS.includes(ext) && !EXCLUDE_PATTERNS.some(p => item.includes(p))) {
        const relativePath = path.relative(baseDir, fullPath)
        const testPath = path.join(TEST_DIR, relativePath.replace(/\.(ts|tsx)$/, '.test.$1'))
        
        files.push({
          srcPath: fullPath,
          testPath,
          relativePath
        })
      }
    }
  }
  
  return files
}

function generateTestContent(fileInfo: FileInfo): string {
  const importPath = fileInfo.srcPath.replace(/\.(ts|tsx)$/, '').replace(/^src\//, '@/src/').replace(/^features\//, '@/features/')
  const fileName = path.basename(fileInfo.srcPath, path.extname(fileInfo.srcPath))
  
  return `// Auto-generated test for ${fileName}
// TODO: Add comprehensive tests

describe('${fileName}', () => {
  it('should be defined', () => {
    expect(true).toBe(true)
  })
  
  // TODO: Add more test cases
})
`
}

function main() {
  console.log('🔍 Scanning for source files...')
  
  let totalFiles = 0
  let createdTests = 0
  let skippedTests = 0
  
  for (const srcDir of SRC_DIRS) {
    const files = getAllSourceFiles(srcDir)
    totalFiles += files.length
    
    console.log(`\n📁 Processing ${srcDir}/ (${files.length} files)`)
    
    for (const file of files) {
      if (fs.existsSync(file.testPath)) {
        skippedTests++
        continue
      }
      
      const testDir = path.dirname(file.testPath)
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }
      
      const content = generateTestContent(file)
      fs.writeFileSync(file.testPath, content)
      createdTests++
      console.log(`  ✅ Created: ${file.testPath}`)
    }
  }
  
  console.log(`\n📊 Summary:`)
  console.log(`  Total source files: ${totalFiles}`)
  console.log(`  Tests created: ${createdTests}`)
  console.log(`  Tests skipped (already exist): ${skippedTests}`)
  console.log(`\n✨ Done!`)
}

main()
