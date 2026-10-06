import { useEffect, useRef } from 'react';
import { FiBold, FiItalic, FiUnderline, FiList, FiLink, FiRotateCcw, FiRotateCw } from 'react-icons/fi';
import { MdFormatListNumbered, MdFormatClear } from 'react-icons/md';

// Product descriptions are stored as HTML. Only these tags/attributes survive, so pasted or saved
// markup can never run scripts on the store.
const ALLOWED = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'DIV', 'SPAN']);

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const clean = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) return child.remove();
      if (!ALLOWED.has(child.tagName)) {
        // Unknown wrappers (font, table cells from Word…) keep their text; dangerous ones are dropped
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|svg|SVG|MATH|TEMPLATE)$/.test(child.tagName)) return child.remove();
        clean(child);
        return child.replaceWith(...child.childNodes);
      }
      const href = child.tagName === 'A' ? child.getAttribute('href') || '' : null;
      [...child.attributes].forEach((a) => child.removeAttribute(a.name));
      if (href && /^(https?:|mailto:|tel:|\/)/i.test(href.trim())) {
        child.setAttribute('href', href.trim());
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
      clean(child);
    });
  };
  const root = doc.body.firstChild;
  clean(root);
  return root.innerHTML;
}

const isHtml = (s) => /<\/?[a-z][\s\S]*>/i.test(s || '');

// Old descriptions are plain text — keep their line breaks
export function RichText({ html, className = '' }) {
  if (!html) return null;
  if (!isHtml(html)) return <div className={`pre ${className}`}>{html}</div>;
  return <div className={`rte-view ${className}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}

const escapeText = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const textToHtml = (t) => (t || '').split(/\n/).map((l) => (l.trim() ? `<p>${escapeText(l)}</p>` : '<p><br></p>')).join('');

const TOOLS = [
  ['bold', <FiBold key="b" />, 'Bold'],
  ['italic', <FiItalic key="i" />, 'Italic'],
  ['underline', <FiUnderline key="u" />, 'Underline'],
  ['h3', <b key="h">H</b>, 'Heading'],
  ['p', <span key="p">¶</span>, 'Normal text'],
  ['insertUnorderedList', <FiList key="ul" />, 'Bullet list'],
  ['insertOrderedList', <MdFormatListNumbered key="ol" />, 'Numbered list'],
  ['link', <FiLink key="a" />, 'Link'],
  ['removeFormat', <MdFormatClear key="c" />, 'Clear formatting'],
  ['undo', <FiRotateCcw key="z" />, 'Undo'],
  ['redo', <FiRotateCw key="y" />, 'Redo'],
];

export function RichTextEditor({ value, onChange, placeholder = 'Write the product description…' }) {
  const ref = useRef(null);
  const last = useRef(null);
  // Load outside changes (e.g. the product finished loading) without resetting the caret while typing
  useEffect(() => {
    if (!ref.current || value === last.current) return;
    const html = isHtml(value) ? sanitizeHtml(value) : textToHtml(value);
    ref.current.innerHTML = html;
    last.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current;
    const html = el.textContent.trim() || el.querySelector('li') ? sanitizeHtml(el.innerHTML) : '';
    last.current = html;
    onChange(html);
  };
  const run = (cmd) => {
    ref.current.focus();
    if (cmd === 'h3' || cmd === 'p') document.execCommand('formatBlock', false, cmd === 'h3' ? 'H3' : 'P');
    else if (cmd === 'link') {
      const url = window.prompt('Link URL (https://…)');
      if (url) document.execCommand('createLink', false, url);
    } else document.execCommand(cmd, false);
    emit();
  };
  // Paste keeps line breaks and basic formatting but drops styles from Word/websites
  const onPaste = (e) => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    document.execCommand('insertHTML', false, html ? sanitizeHtml(html) : textToHtml(e.clipboardData.getData('text/plain')));
    emit();
  };

  return (
    <div className="rte">
      <div className="rte__bar">
        {TOOLS.map(([cmd, icon, title]) => (
          <button key={cmd} type="button" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={() => run(cmd)}>{icon}</button>
        ))}
      </div>
      <div ref={ref} className="rte__area rte-view" contentEditable suppressContentEditableWarning
        data-placeholder={placeholder} onInput={emit} onBlur={emit} onPaste={onPaste} />
    </div>
  );
}
