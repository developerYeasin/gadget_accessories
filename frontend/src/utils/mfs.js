// Self MFS: customers send money to the store's own bKash / Nagad / Rocket number
export const MFS = [
  { key: 'bkash', name: 'bKash', color: '#e2136e' },
  { key: 'nagad', name: 'Nagad', color: '#f6921e' },
  { key: 'rocket', name: 'Rocket', color: '#8c3494' },
];
export const MFS_TYPES = [['personal', 'Personal'], ['agent', 'Agent'], ['merchant', 'Merchant']];
// What the customer picks in their app for each account type
export const MFS_ACTION = { personal: 'Send Money', agent: 'Cash Out', merchant: 'Payment' };

export const activeMfs = (s) => (s.mfs_enabled === '1'
  ? MFS.filter((m) => s[`mfs_${m.key}_enabled`] === '1' && s[`mfs_${m.key}_number`])
    .map((m) => ({ ...m, number: s[`mfs_${m.key}_number`], type: s[`mfs_${m.key}_type`] || 'personal' }))
  : []);
