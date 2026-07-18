(function () {
  'use strict';

  const API_BASE = 'https://api.hxypqr.com/wp-json/wp/v2/posts';
  const TRUSTED_INTERACTIVE_POST_IDS = new Set(['113']);
  const MATH_OPTIONS = {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
      { left: '\\[', right: '\\]', display: true }
    ],
    ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
    throwOnError: false,
    strict: 'ignore'
  };

  function decodeRenderedText(value) {
    const template = document.createElement('template');
    template.innerHTML = String(value || '');
    return (template.content.textContent || '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    }).format(date);
  }

  function renderMath(root) {
    if (root && typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(root, MATH_OPTIONS);
      } catch (error) {
        console.error('Unable to render mathematics:', error);
      }
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const ALLOWED_CONTENT_TAGS = [
    'a', 'article', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em',
    'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr',
    'i', 'img', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub',
    'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
  ];
  const ALLOWED_CONTENT_ATTRIBUTES = [
    'align', 'alt', 'aria-describedby', 'class', 'colspan', 'decoding',
    'height', 'href', 'id', 'loading', 'name', 'rel', 'rowspan', 'sizes',
    'src', 'srcset', 'style', 'title', 'width'
  ];
  const INTERACTIVE_CONTENT_ATTRIBUTES = [
    'aria-label', 'data-kh-copy', 'data-kh-frame-index', 'data-kh-label-en',
    'data-kh-label-zh', 'data-language', 'hidden', 'lang'
  ];
  const GLOBAL_CONTENT_ATTRIBUTES = new Set([
    'aria-describedby', 'class', 'id', 'style', 'title'
  ]);
  const ELEMENT_CONTENT_ATTRIBUTES = {
    A: new Set(['href', 'name', 'rel']),
    IMG: new Set([
      'alt', 'decoding', 'height', 'loading', 'sizes', 'src', 'srcset', 'width'
    ]),
    P: new Set(['align']),
    TD: new Set(['align', 'colspan', 'rowspan']),
    TH: new Set(['align', 'colspan', 'rowspan'])
  };
  const ALLOWED_STYLE_PROPERTIES = new Set([
    'background', 'background-color', 'border', 'border-left', 'color',
    'height', 'margin', 'max-width', 'overflow', 'padding', 'text-align',
    'width'
  ]);
  const CSS_LENGTH = '(?:0|\\d+(?:\\.\\d+)?(?:px|rem|em|%|vh|vw))';
  const CSS_LENGTH_LIST = new RegExp(`^${CSS_LENGTH}(?:\\s+${CSS_LENGTH}){0,3}$`, 'i');
  const CSS_COLOR = /^#[0-9a-f]{3,8}$/i;
  const CSS_BORDER = /^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double)\s+#[0-9a-f]{3,8}$/i;

  function isSafeUrl(value, attributeName) {
    const urlValue = String(value || '').trim();
    if (!urlValue) {
      return false;
    }

    const compactValue = urlValue.replace(/[\u0000-\u0020\u007f-\u009f]+/g, '');
    if (/^(?:blob|data|file|javascript|vbscript):/i.test(compactValue)) {
      return false;
    }

    try {
      const parsedUrl = new URL(urlValue, 'https://hxypqr.github.io/');
      if (attributeName === 'href') {
        return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsedUrl.protocol);
      }
      return parsedUrl.protocol === 'https:';
    } catch (error) {
      return false;
    }
  }

  function sanitizeSrcset(value) {
    const candidates = String(value || '').split(',');
    const safeCandidates = candidates.filter(function (candidate) {
      const parts = candidate.trim().split(/\s+/);
      if (!parts[0] || !isSafeUrl(parts[0], 'src')) {
        return false;
      }
      return parts.length === 1 ||
        (parts.length === 2 && /^(?:\d+(?:\.\d+)?x|\d+w)$/.test(parts[1]));
    });
    return safeCandidates.join(', ');
  }

  function sanitizeInlineStyle(value) {
    const rawStyle = String(value || '');
    if (!rawStyle || /[\\@]|\/\*|!important/i.test(rawStyle)) {
      return '';
    }

    const safeDeclarations = [];
    rawStyle.split(';').forEach(function (declaration) {
      const separator = declaration.indexOf(':');
      if (separator === -1) {
        return;
      }

      const property = declaration.slice(0, separator).trim().toLowerCase();
      const propertyValue = declaration.slice(separator + 1).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPERTIES.has(property) || !propertyValue) {
        return;
      }

      let isSafe = false;
      if (property === 'text-align') {
        isSafe = /^(?:left|center|right|justify|start|end)$/.test(propertyValue);
      } else if (property === 'overflow') {
        isSafe = /^(?:auto|hidden|scroll|visible|clip)$/.test(propertyValue);
      } else if (['height', 'max-width', 'width'].includes(property)) {
        isSafe = propertyValue === 'auto' || new RegExp(`^${CSS_LENGTH}$`, 'i').test(propertyValue);
      } else if (['margin', 'padding'].includes(property)) {
        isSafe = CSS_LENGTH_LIST.test(propertyValue);
      } else if (['background', 'background-color', 'color'].includes(property)) {
        isSafe = CSS_COLOR.test(propertyValue);
      } else if (property === 'border' || property === 'border-left') {
        isSafe = CSS_BORDER.test(propertyValue);
      }

      if (isSafe) {
        safeDeclarations.push(`${property}:${propertyValue}`);
      }
    });

    return safeDeclarations.length > 0 ? `${safeDeclarations.join(';')};` : '';
  }

  function sanitizeClassName(value) {
    return String(value || '')
      .split(/\s+/)
      .filter(function (token) {
        return /^[a-z0-9_-]{1,64}$/i.test(token);
      })
      .slice(0, 32)
      .join(' ');
  }

  function prefixLegacyTargets(root, postId) {
    const firstTargetByOriginalValue = new Map();
    let targetSequence = 0;
    const safePostId = /^\d+$/.test(String(postId || '')) ? String(postId) : 'post';

    root.querySelectorAll('[id], a[name]').forEach(function (element) {
      const targetForThisElement = new Map();
      ['id', 'name'].forEach(function (attributeName) {
        if (!element.hasAttribute(attributeName)) {
          return;
        }

        const originalValue = element.getAttribute(attributeName) || '';
        if (!originalValue) {
          element.removeAttribute(attributeName);
          return;
        }

        let safeTarget = targetForThisElement.get(originalValue);
        if (!safeTarget) {
          targetSequence += 1;
          safeTarget = `user-content-${safePostId}-${targetSequence}`;
          targetForThisElement.set(originalValue, safeTarget);
          if (!firstTargetByOriginalValue.has(originalValue)) {
            firstTargetByOriginalValue.set(originalValue, safeTarget);
          }
        }
        element.setAttribute(attributeName, safeTarget);
      });
    });

    root.querySelectorAll('a[href^="#"]').forEach(function (link) {
      const originalTarget = (link.getAttribute('href') || '').slice(1);
      let mappedTarget = firstTargetByOriginalValue.get(originalTarget);
      if (!mappedTarget) {
        try {
          mappedTarget = firstTargetByOriginalValue.get(decodeURIComponent(originalTarget));
        } catch (error) {
          mappedTarget = null;
        }
      }
      if (mappedTarget) {
        link.setAttribute('href', `#${mappedTarget}`);
      }
    });

    root.querySelectorAll('[aria-describedby]').forEach(function (element) {
      const targets = (element.getAttribute('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(function (target) {
          return firstTargetByOriginalValue.get(target) || target;
        });
      if (targets.length > 0) {
        element.setAttribute('aria-describedby', targets.join(' '));
      } else {
        element.removeAttribute('aria-describedby');
      }
    });
  }

  function sanitizeRenderedHtml(value, postId) {
    if (!window.DOMPurify || typeof window.DOMPurify.sanitize !== 'function') {
      console.error('DOMPurify is unavailable; refusing to insert remote HTML.');
      return '<p class="blog-error">文章内容暂时无法安全显示。</p>';
    }

    const isTrustedInteractivePost = TRUSTED_INTERACTIVE_POST_IDS.has(String(postId || ''));
    const allowedAttributes = isTrustedInteractivePost
      ? ALLOWED_CONTENT_ATTRIBUTES.concat(INTERACTIVE_CONTENT_ATTRIBUTES)
      : ALLOWED_CONTENT_ATTRIBUTES;
    const interactiveAttributes = isTrustedInteractivePost
      ? new Set(INTERACTIVE_CONTENT_ATTRIBUTES)
      : new Set();
    const trustedFrames = [];
    let sourceHtml = String(value || '');

    if (isTrustedInteractivePost) {
      const sourceTemplate = document.createElement('template');
      sourceTemplate.innerHTML = sourceHtml;
      sourceTemplate.content.querySelectorAll('iframe').forEach(function (frame) {
        const sandboxValue = (frame.getAttribute('sandbox') || '').trim();
        const srcdocValue = frame.getAttribute('srcdoc') || '';
        const titleValue = (frame.getAttribute('title') || '').slice(0, 300);
        const styleValue = frame.getAttribute('style') || '';
        const heightMatch = styleValue.match(/(?:^|;)\s*height\s*:\s*(\d{3,4})px(?:;|$)/i);
        const heightValue = heightMatch ? Number(heightMatch[1]) : 700;
        const isTrustedFrame =
          frame.classList.contains('kh-figure-frame') &&
          sandboxValue === 'allow-scripts' &&
          srcdocValue.length > 0 &&
          srcdocValue.length <= 750000 &&
          /^\s*<!doctype html>/i.test(srcdocValue) &&
          heightValue >= 300 &&
          heightValue <= 1200;

        if (!isTrustedFrame || trustedFrames.length >= 5) {
          frame.remove();
          return;
        }

        const frameIndex = trustedFrames.push({
          height: heightValue,
          srcdoc: srcdocValue,
          title: titleValue
        }) - 1;
        const placeholder = document.createElement('div');
        placeholder.className = 'kh-iframe-placeholder';
        placeholder.setAttribute('data-kh-frame-index', String(frameIndex));
        frame.replaceWith(placeholder);
      });
      sourceHtml = sourceTemplate.innerHTML;
    }

    const purifiedHtml = window.DOMPurify.sanitize(sourceHtml, {
      ALLOWED_ATTR: allowedAttributes,
      ALLOWED_TAGS: ALLOWED_CONTENT_TAGS,
      ALLOW_ARIA_ATTR: isTrustedInteractivePost,
      ALLOW_DATA_ATTR: isTrustedInteractivePost,
      KEEP_CONTENT: true
    });
    const template = document.createElement('template');
    template.innerHTML = purifiedHtml;

    Array.from(template.content.querySelectorAll('*')).forEach(function (element) {
      const tagAttributes = ELEMENT_CONTENT_ATTRIBUTES[element.tagName] || new Set();

      Array.from(element.attributes).forEach(function (attribute) {
        const name = attribute.name.toLowerCase();
        const attributeValue = attribute.value;
        if (
          !GLOBAL_CONTENT_ATTRIBUTES.has(name) &&
          !tagAttributes.has(name) &&
          !interactiveAttributes.has(name)
        ) {
          element.removeAttribute(attribute.name);
        } else if ((name === 'href' || name === 'src') && !isSafeUrl(attributeValue, name)) {
          element.removeAttribute(attribute.name);
        } else if (name === 'srcset') {
          const safeSrcset = sanitizeSrcset(attributeValue);
          if (safeSrcset) {
            element.setAttribute(attribute.name, safeSrcset);
          } else {
            element.removeAttribute(attribute.name);
          }
        } else if (name === 'style') {
          const safeStyle = sanitizeInlineStyle(attributeValue);
          if (safeStyle) {
            element.setAttribute('style', safeStyle);
          } else {
            element.removeAttribute('style');
          }
        } else if (name === 'class') {
          const safeClassName = sanitizeClassName(attributeValue);
          if (safeClassName) {
            element.setAttribute('class', safeClassName);
          } else {
            element.removeAttribute('class');
          }
        } else if (name === 'rel') {
          const safeRel = attributeValue
            .split(/\s+/)
            .filter(function (token) {
              return ['nofollow', 'noopener', 'noreferrer', 'ugc'].includes(token.toLowerCase());
            })
            .join(' ');
          if (safeRel) {
            element.setAttribute('rel', safeRel);
          } else {
            element.removeAttribute('rel');
          }
        } else if (name === 'loading' && !/^(?:eager|lazy)$/i.test(attributeValue)) {
          element.removeAttribute('loading');
        } else if (name === 'decoding' && !/^(?:async|auto|sync)$/i.test(attributeValue)) {
          element.removeAttribute('decoding');
        } else if (name === 'lang' && !/^(?:zh-CN|en)$/i.test(attributeValue)) {
          element.removeAttribute('lang');
        } else if (name === 'aria-label' && attributeValue.length > 300) {
          element.removeAttribute('aria-label');
        } else if (name.startsWith('data-kh-') && attributeValue.length > 500) {
          element.removeAttribute(attribute.name);
        } else if (name === 'data-language' && !/^(?:zh|en)$/.test(attributeValue)) {
          element.removeAttribute('data-language');
        } else if (name === 'data-kh-frame-index' && !/^\d$/.test(attributeValue)) {
          element.removeAttribute('data-kh-frame-index');
        } else if ((name === 'width' || name === 'height') && !/^[1-9]\d{0,4}$/.test(attributeValue)) {
          element.removeAttribute(attribute.name);
        } else if ((name === 'colspan' || name === 'rowspan') && !/^[1-9]\d{0,2}$/.test(attributeValue)) {
          element.removeAttribute(attribute.name);
        } else if (name === 'align' && !/^(?:center|left|right)$/i.test(attributeValue)) {
          element.removeAttribute('align');
        } else if (
          name === 'sizes' &&
          (attributeValue.length > 512 || !/^[a-z0-9\s().,:/%+*-]+$/i.test(attributeValue))
        ) {
          element.removeAttribute('sizes');
        }
      });
    });

    prefixLegacyTargets(template.content, postId);
    template.content.querySelectorAll('[data-kh-frame-index]').forEach(function (placeholder) {
      const frameIndex = Number(placeholder.getAttribute('data-kh-frame-index'));
      const trustedFrame = trustedFrames[frameIndex];
      if (!trustedFrame) {
        placeholder.remove();
        return;
      }

      const frame = document.createElement('iframe');
      frame.className = 'kh-figure-frame';
      frame.loading = 'lazy';
      frame.referrerPolicy = 'no-referrer';
      frame.sandbox.add('allow-scripts');
      frame.srcdoc = trustedFrame.srcdoc;
      frame.title = trustedFrame.title;
      frame.style.height = `${trustedFrame.height}px`;
      placeholder.replaceWith(frame);
    });
    return template.innerHTML;
  }

  function isEscaped(value, index) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
      backslashes += 1;
    }
    return backslashes % 2 === 1;
  }

  function findClosingDelimiter(value, delimiter, start) {
    let cursor = start;
    while (cursor < value.length) {
      const match = value.indexOf(delimiter, cursor);
      if (match === -1) {
        return -1;
      }

      if (!isEscaped(value, match)) {
        if (delimiter !== '$' || (value[match - 1] !== '$' && value[match + 1] !== '$')) {
          return match;
        }
      }
      cursor = match + delimiter.length;
    }
    return -1;
  }

  function protectPairedMath(paragraphHtml) {
    let output = '';
    let cursor = 0;

    while (cursor < paragraphHtml.length) {
      if (paragraphHtml.startsWith('<!--', cursor)) {
        const commentEnd = paragraphHtml.indexOf('-->', cursor + 4);
        const end = commentEnd === -1 ? paragraphHtml.length : commentEnd + 3;
        output += paragraphHtml.slice(cursor, end);
        cursor = end;
        continue;
      }

      if (paragraphHtml[cursor] === '<') {
        const tag = paragraphHtml.slice(cursor).match(/^<\/?[a-z][^>]*>/i);
        if (tag) {
          output += tag[0];
          cursor += tag[0].length;
          continue;
        }
      }

      let opening = null;
      let closing = null;
      if (paragraphHtml.startsWith('$$', cursor) && !isEscaped(paragraphHtml, cursor)) {
        opening = '$$';
        closing = '$$';
      } else if (paragraphHtml.startsWith('\\[', cursor) && !isEscaped(paragraphHtml, cursor)) {
        opening = '\\[';
        closing = '\\]';
      } else if (paragraphHtml.startsWith('\\(', cursor) && !isEscaped(paragraphHtml, cursor)) {
        opening = '\\(';
        closing = '\\)';
      } else if (
        paragraphHtml[cursor] === '$' &&
        paragraphHtml[cursor - 1] !== '$' &&
        paragraphHtml[cursor + 1] !== '$' &&
        !paragraphHtml.slice(cursor + 1, cursor + 6).toLowerCase().startsWith('latex') &&
        !isEscaped(paragraphHtml, cursor)
      ) {
        opening = '$';
        closing = '$';
      }

      if (!opening) {
        output += paragraphHtml[cursor];
        cursor += 1;
        continue;
      }

      const closeIndex = findClosingDelimiter(
        paragraphHtml,
        closing,
        cursor + opening.length
      );
      if (closeIndex === -1) {
        output += paragraphHtml[cursor];
        cursor += 1;
        continue;
      }

      const formula = paragraphHtml.slice(cursor + opening.length, closeIndex);
      const formulaWithoutBreaks = formula.replace(/<br\s*\/?\s*>/gi, '\n');
      const containsHtml = /<\/?(?:a|span|strong|em|code|img|sup|sub)\b[^>]*>/i
        .test(formulaWithoutBreaks);
      const protectedFormula = containsHtml
        ? formula
        : formulaWithoutBreaks.replace(/</g, '&lt;');

      output += opening + protectedFormula + closing;
      cursor = closeIndex + closing.length;
    }

    return output;
  }

  function prepareRenderedHtml(value, postId) {
    let html = String(value || '');
    const numericPostId = Number(postId);

    if (numericPostId === 62) {
      html = html.replace(
        /(<p\s+style=["']text-align:left;?["']>\s*)(\\sum_\{i=1\}\^n\\int_\{I_i\\times J_i\}[\s\S]*?\\int_N[\s\S]*?)\$(\s*<\/p>)/i,
        function (_, open, formula, close) {
          return `${open}$$${formula}$$${close}`;
        }
      );
    }

    if (numericPostId === 79) {
      const brokenFormula = String.raw`latex N \phi_{\lambda} =\{x:\phi_{\lambda}(x)=0\}$`;
      const fixedFormula = String.raw`$N \phi_{\lambda} =\{x:\phi_{\lambda}(x)=0\}$`;
      html = html.replace(brokenFormula, fixedFormula);
    }

    if (numericPostId === 56) {
      html = html.replace('where $latex$ is the number', 'where $t$ is the number');
    }

    if (numericPostId === 11) {
      html = html.split('https://66.42.109.149/wp-content/')
        .join('https://api.hxypqr.com/wp-content/');
    }

    if (numericPostId === 74) {
      html = html.replace(/\\end\)/g, '(end)');
    }

    const preparedHtml = html.replace(
      /(<p\b[^>]*>)([\s\S]*?)(<\/p>)/gi,
      function (_, open, body, close) {
        return open + protectPairedMath(body) + close;
      }
    );
    return sanitizeRenderedHtml(preparedHtml, postId);
  }

  function normalizeLegacyMath(root, postId) {
    const numericPostId = Number(postId);

    root.querySelectorAll('p').forEach(function (paragraph) {
      if (paragraph.innerHTML.includes('$latex')) {
        paragraph.innerHTML = paragraph.innerHTML.replace(
          /\$latex(?:\s|&nbsp;|\u00a0)*([\s\S]*?)\$/gi,
          function (_, formulaHtml) {
            const template = document.createElement('template');
            template.innerHTML = formulaHtml;
            const nestedElements = Array.from(template.content.querySelectorAll('*'));
            if (nestedElements.length > 0) {
              const anchors = nestedElements.filter(function (element) {
                return element.tagName === 'A';
              });
              if (anchors.length !== nestedElements.length || anchors.length !== 1) {
                return _;
              }

              const anchor = anchors[0];
              const anchorMarkup = anchor.outerHTML;
              const anchorText = (anchor.textContent || '').trim();
              const linkedFormulaText = (template.content.textContent || '')
                .replace(/&fg=[0-9a-f]{3,8}\s*$/i, '')
                .trim();
              const escapedAnchorText = anchorText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              if (new RegExp(`^\\{?\\(\\s*${escapedAnchorText}\\s*\\)\\}?$`).test(linkedFormulaText)) {
                return `(${anchorMarkup})`;
              }

              anchor.remove();
              const formulaWithoutLink = (template.content.textContent || '')
                .replace(/&fg=[0-9a-f]{3,8}\s*$/i, '')
                .trim();
              return `${anchorMarkup} ${escapeHtml(`\\[${formulaWithoutLink}\\]`)}`;
            }
            const formula = (template.content.textContent || '')
              .replace(/&fg=[0-9a-f]{3,8}\s*$/i, '')
              .trim();
            return escapeHtml(`$${formula}$`);
          }
        );
      }

      if (
        numericPostId === 50 &&
        paragraph.textContent.includes('Mckean-Singer formula')
      ) {
        paragraph.innerHTML = paragraph.innerHTML.replace(
          /(and use the Mckean-Singer formula,we get:\s*)([\s\S]*?)(?:\.\s*where\s+)(?=<img)/i,
          function (_, introduction, equationHtml) {
            const template = document.createElement('template');
            template.innerHTML = equationHtml;
            template.content.querySelectorAll('br').forEach(function (lineBreak) {
              lineBreak.replaceWith(document.createTextNode('\\\\\n'));
            });
            const equation = (template.content.textContent || '')
              .replace(/^ind\s*\(D\^\+\)/, '\\operatorname{ind}(D^+)')
              .replace(/&=&/g, '&=')
              .replace(/D\^=D\^-/, 'D^+D^-')
              .replace(/[–−]/g, '-')
              .trim();
            const math = `\\[\\begin{aligned}${equation}\\end{aligned}\\]`;
            return introduction + escapeHtml(math) + '<br>where ';
          }
        );
      }

      if (
        numericPostId === 58 &&
        paragraph.getAttribute('style') &&
        paragraph.getAttribute('style').includes('text-align:center') &&
        paragraph.textContent.includes('\\sup _{\\Omega}')
      ) {
        const formula = paragraph.textContent
          .trim()
          .replace(/…+\.?\s*\(\*\)\s*$/, '\\tag{*}');
        paragraph.replaceChildren(document.createTextNode(`\\[${formula}\\]`));
      }

      if (
        numericPostId === 53 &&
        paragraph.innerHTML.includes('\\paragraph{Level ')
      ) {
        paragraph.innerHTML = paragraph.innerHTML.replace(
          /\\paragraph\{(Level\s*<img\b[^>]*>\s*structure)\}/i,
          '<span class="legacy-latex-paragraph" role="heading" aria-level="4">$1</span>'
        );
      }

      if (/\\begin\{eqnarray\*?\}/.test(paragraph.innerHTML)) {
        paragraph.innerHTML = paragraph.innerHTML.replace(
          /\\begin\{eqnarray\*?\}([\s\S]*?)\\end\{eqnarray\*?\}/g,
          function (_, equationHtml) {
            const template = document.createElement('template');
            template.innerHTML = equationHtml;
            template.content.querySelectorAll('br').forEach(function (lineBreak) {
              lineBreak.replaceWith(document.createTextNode('\n'));
            });
            const equation = (template.content.textContent || '').trim();
            return escapeHtml(`\\[\n\\begin{aligned}${equation}\\end{aligned}\n\\]`);
          }
        );
      }
    });
  }

  const LEGACY_LINE_BREAK_MARKER = '\u0000';

  function markLineBreaksOutsideMath(value) {
    let output = '';
    let cursor = 0;

    while (cursor < value.length) {
      let opening = null;
      let closing = null;
      if (value.startsWith('$$', cursor) && !isEscaped(value, cursor)) {
        opening = '$$';
        closing = '$$';
      } else if (value.startsWith('\\[', cursor) && !isEscaped(value, cursor)) {
        opening = '\\[';
        closing = '\\]';
      } else if (value.startsWith('\\(', cursor) && !isEscaped(value, cursor)) {
        opening = '\\(';
        closing = '\\)';
      } else if (
        value[cursor] === '$' &&
        value[cursor - 1] !== '$' &&
        value[cursor + 1] !== '$' &&
        !isEscaped(value, cursor)
      ) {
        opening = '$';
        closing = '$';
      }

      if (opening) {
        const closeIndex = findClosingDelimiter(value, closing, cursor + opening.length);
        if (closeIndex !== -1) {
          const end = closeIndex + closing.length;
          output += value.slice(cursor, end);
          cursor = end;
          continue;
        }
      }

      if (value.startsWith('\\\\', cursor)) {
        output += LEGACY_LINE_BREAK_MARKER;
        cursor += 2;
      } else {
        output += value[cursor];
        cursor += 1;
      }
    }

    return output;
  }

  function appendTextWithLineBreaks(fragment, value) {
    const parts = value.split(LEGACY_LINE_BREAK_MARKER);
    parts.forEach(function (part, index) {
      if (part) {
        fragment.appendChild(document.createTextNode(part));
      }
      if (index < parts.length - 1) {
        fragment.appendChild(document.createElement('br'));
      }
    });
  }

  function enhanceLegacyMarkdown(root) {
    root.querySelectorAll('p').forEach(function (paragraph) {
      const headingPattern = /^\s*###\s*([\s\S]*?)\s*###(?=\s*<br\s*\/?>|\s*$)/i;
      if (!headingPattern.test(paragraph.innerHTML)) {
        return;
      }
      paragraph.innerHTML = paragraph.innerHTML.replace(
        headingPattern,
        '<span class="legacy-markdown-heading" role="heading" aria-level="3">$1</span>'
      );
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement.closest('script, style, textarea, pre, code, .katex')) {
        nodes.push(node);
      }
    }

    const boldPattern = /(^|[^*])\*\*([^*\n]+)\*\*(?!\*)/g;
    nodes.forEach(function (node) {
      const value = node.nodeValue || '';
      boldPattern.lastIndex = 0;
      if (!boldPattern.test(value)) {
        return;
      }

      boldPattern.lastIndex = 0;
      if (node.parentElement.tagName === 'STRONG') {
        node.nodeValue = value.replace(boldPattern, '$1$2');
        return;
      }

      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let match;
      while ((match = boldPattern.exec(value)) !== null) {
        if (match.index > cursor) {
          fragment.appendChild(document.createTextNode(value.slice(cursor, match.index)));
        }
        if (match[1]) {
          fragment.appendChild(document.createTextNode(match[1]));
        }
        const strong = document.createElement('strong');
        strong.textContent = match[2];
        fragment.appendChild(strong);
        cursor = boldPattern.lastIndex;
      }
      if (cursor < value.length) {
        fragment.appendChild(document.createTextNode(value.slice(cursor)));
      }
      node.replaceWith(fragment);
    });
  }

  function enhanceLegacyLatex(root, postId) {
    if (!root) {
      return;
    }

    normalizeLegacyMath(root, postId);

    const ignoredSelector = 'script, style, textarea, pre, code, .katex, .katex-display';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || !node.parentElement.closest(ignoredSelector)) {
        textNodes.push(node);
      }
    }

    const environmentNames = {
      thm: 'Theorem',
      theorem: 'Theorem',
      lemma: 'Lemma',
      proposition: 'Proposition',
      definition: 'Definition',
      remark: 'Remark',
      proof: 'Proof'
    };
    const environmentPattern = '(?:thm|theorem|lemma|proposition|definition|remark|proof)';
    const commandPattern = new RegExp(
      '\\\\(section|subsection|paragraph)\\{([^{}\\n]+)\\}' +
      '|\\\\newpage\\b' +
      '|\\\\begin\\{(' + environmentPattern + ')\\}(?:\\(([^)\\n]+)\\))?' +
      '|\\\\end\\{(' + environmentPattern + ')\\}' +
      '|\\\\(cite|bibitem|texttt)\\{((?:[^{}\\n]|\\{[^{}\\n]*\\})+)\\}' +
      '|\\\\(tableofcontents|appendix)\\b',
      'g'
    );
    const convertAllLegacyLineBreaks = [17, 44].includes(Number(postId));

    textNodes.forEach(function (node) {
      const originalValue = node.nodeValue || '';
      const hasTrailingLineBreak = !convertAllLegacyLineBreaks && /\\\\\s*$/.test(originalValue);
      let value = hasTrailingLineBreak
        ? originalValue.replace(/\\\\\s*$/, '')
        : originalValue;
      let removedLegacyLineBreak = false;
      if (convertAllLegacyLineBreaks) {
        value = markLineBreaksOutsideMath(value);
        if (
          value.endsWith(LEGACY_LINE_BREAK_MARKER) &&
          node.nextSibling &&
          node.nextSibling.nodeName === 'BR'
        ) {
          value = value.slice(0, -1);
          removedLegacyLineBreak = true;
        }
      }
      const hasMarkedLineBreak = value.includes(LEGACY_LINE_BREAK_MARKER);
      commandPattern.lastIndex = 0;
      if (
        !commandPattern.test(value) &&
        !hasTrailingLineBreak &&
        !hasMarkedLineBreak &&
        !removedLegacyLineBreak
      ) {
        return;
      }

      commandPattern.lastIndex = 0;
      const fragment = document.createDocumentFragment();
      let cursor = 0;
      let match;

      while ((match = commandPattern.exec(value)) !== null) {
        if (match.index > cursor) {
          appendTextWithLineBreaks(fragment, value.slice(cursor, match.index));
        }

        if (match[1]) {
          const levels = { section: '2', subsection: '3', paragraph: '4' };
          const heading = document.createElement('span');
          heading.className = `legacy-latex-${match[1]}`;
          heading.setAttribute('role', 'heading');
          heading.setAttribute('aria-level', levels[match[1]]);
          heading.textContent = match[2];
          fragment.appendChild(heading);
        } else if (match[0].startsWith('\\newpage')) {
          const pageBreak = document.createElement('span');
          pageBreak.className = 'legacy-latex-page-break';
          pageBreak.setAttribute('aria-hidden', 'true');
          fragment.appendChild(pageBreak);
        } else if (match[3]) {
          const label = document.createElement('span');
          label.className = 'legacy-latex-environment-label';
          label.textContent = environmentNames[match[3]] + (match[4] ? ` (${match[4]})` : '') + '. ';
          fragment.appendChild(label);
        } else if (match[6]) {
          if (match[6] === 'texttt') {
            const code = document.createElement('code');
            code.textContent = match[7].replace(/\\~\{\}/g, '~');
            fragment.appendChild(code);
          } else {
            const reference = document.createElement('span');
            reference.className = match[6] === 'cite'
              ? 'legacy-citation'
              : 'legacy-bibitem-label';
            reference.textContent = `[${match[7]}]${match[6] === 'bibitem' ? ' ' : ''}`;
            fragment.appendChild(reference);
          }
        } else if (match[8] === 'appendix') {
          const appendix = document.createElement('span');
          appendix.className = 'legacy-latex-section';
          appendix.setAttribute('role', 'heading');
          appendix.setAttribute('aria-level', '2');
          appendix.textContent = 'Appendix';
          fragment.appendChild(appendix);
        }

        cursor = commandPattern.lastIndex;
      }

      if (cursor < value.length) {
        appendTextWithLineBreaks(fragment, value.slice(cursor));
      }
      if (hasTrailingLineBreak && (!node.nextSibling || node.nextSibling.nodeName !== 'BR')) {
        fragment.appendChild(document.createElement('br'));
      }
      node.replaceWith(fragment);
    });

    enhanceLegacyMarkdown(root);

    root.querySelectorAll('img').forEach(function (image) {
      if (!image.hasAttribute('loading')) {
        image.loading = 'lazy';
      }
      if (!image.hasAttribute('decoding')) {
        image.decoding = 'async';
      }
    });
  }

  function enhanceInteractivePost(root, postId, postTitle) {
    if (!root || !TRUSTED_INTERACTIVE_POST_IDS.has(String(postId || ''))) {
      return;
    }

    const titles = {
      zh: '从支撑接触到 Hausdorff 分层：凸 k-Hessian 解的四步证明机制',
      en: 'From Supporting Contacts to Hausdorff Stratification: A Four-Step Proof for Convex k-Hessian Solutions'
    };
    const navigation = document.querySelector('.site-nav');
    let button = document.getElementById('kh-language-toggle');

    if (!button) {
      button = document.createElement('button');
      button.id = 'kh-language-toggle';
      button.type = 'button';
      button.className = 'page-link kh-language-toggle';
      if (navigation) {
        navigation.appendChild(button);
      } else {
        root.insertAdjacentElement('beforebegin', button);
      }
    }

    let language = 'zh';
    try {
      language = localStorage.getItem('khessian-blog-language') === 'en' ? 'en' : 'zh';
    } catch (error) {
      language = 'zh';
    }

    function notifyFigures() {
      root.querySelectorAll('.kh-figure-frame').forEach(function (frame) {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({
            type: 'khessian:set-language',
            lang: language
          }, '*');
        }
      });
    }

    function setLanguage(nextLanguage) {
      language = nextLanguage === 'en' ? 'en' : 'zh';
      document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
      root.querySelectorAll('[data-kh-copy]').forEach(function (node) {
        node.hidden = node.getAttribute('data-kh-copy') !== language;
      });
      const article = root.querySelector('article[data-language]');
      if (article) {
        article.dataset.language = language;
      }
      root.querySelectorAll('[data-kh-label-zh]').forEach(function (node) {
        node.setAttribute(
          'aria-label',
          node.getAttribute(language === 'zh' ? 'data-kh-label-zh' : 'data-kh-label-en') || ''
        );
      });
      button.textContent = language === 'zh' ? 'English' : '中文';
      button.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到中文');
      button.setAttribute('aria-pressed', language === 'en' ? 'true' : 'false');
      if (postTitle) {
        postTitle.textContent = titles[language];
      }
      document.title = titles[language];
      notifyFigures();
      try {
        localStorage.setItem('khessian-blog-language', language);
      } catch (error) {
        // The page remains usable when storage is unavailable.
      }
    }

    button.addEventListener('click', function () {
      setLanguage(language === 'zh' ? 'en' : 'zh');
    });
    root.querySelectorAll('.kh-figure-frame').forEach(function (frame) {
      frame.addEventListener('load', notifyFigures);
    });
    setLanguage(language);
  }

  async function fetchPostsPage(page) {
    const parameters = new URLSearchParams({
      page: String(page),
      per_page: '100',
      orderby: 'date',
      order: 'desc',
      _fields: 'id,date,title,excerpt'
    });
    const response = await fetch(`${API_BASE}?${parameters.toString()}`, {
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`WordPress API returned ${response.status}`);
    }

    return {
      posts: await response.json(),
      totalPages: Math.max(1, Number(response.headers.get('X-WP-TotalPages')) || 1),
      totalPosts: Math.max(0, Number(response.headers.get('X-WP-Total')) || 0)
    };
  }

  async function fetchAllPosts() {
    const firstPage = await fetchPostsPage(1);
    if (firstPage.totalPages === 1) {
      return {
        posts: firstPage.posts,
        totalPosts: firstPage.totalPosts || firstPage.posts.length
      };
    }

    const remainingPages = Array.from(
      { length: firstPage.totalPages - 1 },
      function (_, index) { return fetchPostsPage(index + 2); }
    );
    const pageResults = await Promise.all(remainingPages);

    return {
      posts: firstPage.posts.concat(...pageResults.map(function (result) { return result.posts; })),
      totalPosts: firstPage.totalPosts
    };
  }

  window.BlogApp = Object.freeze({
    apiBase: API_BASE,
    decodeRenderedText: decodeRenderedText,
    enhanceInteractivePost: enhanceInteractivePost,
    enhanceLegacyLatex: enhanceLegacyLatex,
    formatDate: formatDate,
    prepareRenderedHtml: prepareRenderedHtml,
    renderMath: renderMath,
    sanitizeRenderedHtml: sanitizeRenderedHtml
  });

  document.addEventListener('DOMContentLoaded', async function () {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) {
      return;
    }

    const status = document.getElementById('posts-status');
    if (status) {
      status.textContent = '正在加载全部文章…';
    }

    try {
      const result = await fetchAllPosts();
      const fragment = document.createDocumentFragment();

      result.posts.forEach(function (post) {
        const postElement = document.createElement('article');
        postElement.className = 'post';

        const postTitle = document.createElement('h2');
        const postLink = document.createElement('a');
        postLink.href = `/post.html?id=${encodeURIComponent(post.id)}`;
        postLink.textContent = decodeRenderedText(post.title && post.title.rendered);
        postTitle.appendChild(postLink);

        const postDate = document.createElement('time');
        postDate.className = 'post-date';
        postDate.dateTime = post.date;
        postDate.textContent = formatDate(post.date);

        const postExcerpt = document.createElement('div');
        postExcerpt.className = 'post-excerpt';
        postExcerpt.innerHTML = sanitizeRenderedHtml(
          post.excerpt && post.excerpt.rendered ? post.excerpt.rendered : '',
          post.id
        );
        enhanceLegacyLatex(postExcerpt, post.id);

        postElement.append(postTitle, postDate, postExcerpt);
        fragment.appendChild(postElement);
      });

      postsContainer.replaceChildren(fragment);
      renderMath(postsContainer);

      if (status) {
        status.textContent = `共 ${result.posts.length} 篇文章`;
      }
    } catch (error) {
      console.error('Unable to load blog posts:', error);
      postsContainer.replaceChildren();
      const message = document.createElement('p');
      message.className = 'blog-error';
      message.textContent = '文章列表加载失败，请稍后刷新重试。';
      postsContainer.appendChild(message);
      if (status) {
        status.textContent = '';
      }
    }
  });
})();
