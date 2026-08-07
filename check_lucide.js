const lucide = require('lucide-react');

const importsToCheck = [
  'LayoutDashboard', 'Package', 'ShoppingCart', 'Users', 'Tags', 'Settings', 'ImageIcon', 'BarChart', 'LogOut',
  'Image',
  'ArrowRight', 'Star', 'ShieldCheck', 'Truck', 'RefreshCw',
  'Search', 'ShoppingBag', 'User', 'Menu', 'X',
  'CheckCircle', 'AlertCircle',
  'CheckCircle2', 'ChevronRight', 'Lock',
  'Minus', 'Plus',
  'Instagram', 'Facebook', 'Twitter', 'Youtube',
  'ArrowUpRight', 'ArrowDownRight', 'DollarSign',
  'Plus', 'Filter', 'MoreHorizontal', 'Edit', 'Trash2', 'MapPin', 'Heart'
];

const undefinedImports = importsToCheck.filter(imp => lucide[imp] === undefined);
console.log("Undefined lucide-react imports:", undefinedImports);
