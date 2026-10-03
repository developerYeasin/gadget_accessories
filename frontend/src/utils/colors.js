// Color options get a swatch: common English/Bangla names, or any CSS color / #hex the admin typed
export const isColorGroup = (name = '') => /colou?r|রং|রঙ|কালার/i.test(name);

const COLOR_NAMES = {
  'সাদা': 'white', 'কালো': 'black', 'লাল': 'red', 'নীল': 'blue', 'সবুজ': 'green', 'হলুদ': 'yellow', 'গোলাপি': 'pink',
  'বেগুনি': 'purple', 'কমলা': 'orange', 'ধূসর': 'gray', 'বাদামি': 'brown', 'সোনালি': 'gold', 'রুপালি': 'silver', 'আকাশি': 'skyblue',
  'rose gold': '#b76e79', 'space gray': '#4a4b4f', 'space grey': '#4a4b4f', 'midnight': '#1d2433', 'golden': 'gold',
  'starlight': '#f1e9dc', 'graphite': '#41424c', 'titanium': '#8a8680', 'cream': '#f3ead3', 'off white': '#f5f2ea',
};

export const swatchColor = (val = '') => {
  const key = String(val).trim().toLowerCase();
  if (COLOR_NAMES[key]) return COLOR_NAMES[key];
  const css = key.replace(/\s+/g, '');
  return typeof CSS !== 'undefined' && CSS.supports('color', css) ? css : null;
};

// The product's color group, if any (options are [{ name, values }])
export const colorGroup = (options) => (options || []).find((o) => isColorGroup(o.name)) || null;
