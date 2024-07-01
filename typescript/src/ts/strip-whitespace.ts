/**
 * The following code snippet is copied from the index.ts file of the strip-json-trailing-commas project
 * (commit 3cfa16a2aa6bbef8ed740c346321ef6c2b42237d),
 * available at: https://github.com/nokazn/strip-json-trailing-commas/blob/3cfa16a2aa6bbef8ed740c346321ef6c2b42237d/src/index.ts
 * 
 * The original code is licensed under the MIT License:
 * 
 * MIT License
 * 
 * Copyright 2021 https://github.com/nokazn
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
  
export default function stripJsonTrailingCommas(content: string): string {
    /**
     * preceded by number or string or boolean (true/false) or null or '}' or ']' (and with 0 or more spaces)
     * match with ','
     * followed by '}' or ']'
     */
    return content.replace(/(?<=(true|false|null|["\d}\]])\s*),(?=\s*[}\]])/g, '');
}