// DFA 敏感词匹配引擎
// 基于 Trie 字典树实现，长词优先匹配

class DFAMatcher {
  constructor() {
    this.root = {};
    this.built = false;
  }

  addWord(word) {
    let node = this.root;
    for (const char of word) {
      if (!node[char]) {
        node[char] = {};
      }
      node = node[char];
    }
    node.isEnd = true;
    node.word = word;
  }

  build(words) {
    this.root = {};
    for (const word of words) {
      this.addWord(word);
    }
    this.built = true;
  }

  match(text) {
    const results = [];
    const len = text.length;

    for (let i = 0; i < len; i++) {
      let node = this.root;
      let j = i;
      let lastMatch = null;

      while (j < len && node[text[j]]) {
        node = node[text[j]];
        if (node.isEnd) {
          lastMatch = { word: node.word, start: i, end: j + 1 };
        }
        j++;
      }

      if (lastMatch) {
        results.push(lastMatch);
        i = lastMatch.end - 1; // skip past the match
      }
    }

    return results;
  }
}

export default DFAMatcher;
