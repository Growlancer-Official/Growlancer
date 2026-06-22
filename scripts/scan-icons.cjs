/**
 * Scan ALL src/pages/ and src/components/ files for missing lucide-react icon imports.
 * 
 * Usage: node scripts/scan-icons.js [--fix]
 * 
 * --fix : Automatically add missing imports
 */

const fs = require('fs');
const path = require('path');

const shouldFix = process.argv.includes('--fix');

// All valid lucide-react icon names (from the package)
// We'll dynamically discover these, but for now use a comprehensive list
// This is a subset - icons that appear commonly in our codebase
const COMMON_ICONS = new Set([
  'Accessibility', 'Activity', 'Airplay', 'AlarmCheck', 'AlarmClock', 'AlarmMinus', 'AlarmPlus', 'AlertCircle', 'AlertOctagon', 'AlertTriangle',
  'AlignCenter', 'AlignJustify', 'AlignLeft', 'AlignRight', 'Anchor', 'Aperture', 'Archive', 'ArrowDown', 'ArrowDownCircle', 'ArrowDownLeft',
  'ArrowDownRight', 'ArrowLeft', 'ArrowLeftCircle', 'ArrowRight', 'ArrowRightCircle', 'ArrowUp', 'ArrowUpCircle', 'ArrowUpLeft', 'ArrowUpRight',
  'AtSign', 'Award', 'Axis3d', 'Baby', 'Backpack', 'Badge', 'BadgeAlert', 'BadgeCheck', 'BadgeDollarSign', 'BadgeHelp',
  'BadgeInfo', 'BadgeMinus', 'BadgePercent', 'BadgePlus', 'BadgeX', 'BaggageClaim', 'Ban', 'Banana', 'Banknote', 'BarChart',
  'BarChart2', 'BarChart3', 'BarChart4', 'Barbell', 'Barcode', 'Baseline', 'Bath', 'Battery', 'BatteryCharging', 'BatteryFull',
  'BatteryLow', 'BatteryMedium', 'BatteryWarning', 'Beaker', 'Bean', 'BeanOff', 'Bed', 'BedDouble', 'BedSingle', 'Beef',
  'Beer', 'Bell', 'BellDot', 'BellMinus', 'BellOff', 'BellPlus', 'BellRing', 'Bike', 'Binary', 'Biohazard',
  'Bird', 'Bitcoin', 'Blinds', 'Blocks', 'Bluetooth', 'BluetoothConnected', 'BluetoothOff', 'BluetoothSearching', 'Bold', 'Bomb',
  'Bone', 'Book', 'BookA', 'BookAudio', 'BookCheck', 'BookCopy', 'BookDashed', 'BookDown', 'BookHeadphones', 'BookHeart',
  'BookImage', 'BookKey', 'BookLock', 'BookMarked', 'BookMinus', 'BookOpen', 'BookOpenCheck', 'BookOpenText', 'BookPlus', 'BookText',
  'BookType', 'BookUp', 'BookUp2', 'BookUser', 'BookX', 'Bookmark', 'BookmarkCheck', 'BookmarkMinus', 'BookmarkPlus', 'BookmarkX',
  'BoomBox', 'Bot', 'BotMessageSquare', 'BotOff', 'Box', 'BoxSelect', 'Boxes', 'Braces', 'Brackets', 'Brain',
  'BrainCircuit', 'BrainCog', 'Branch', 'Briefcase', 'BriefcaseBusiness', 'BriefcaseMedical', 'BringToFront', 'Brush', 'Bug', 'BugPlay',
  'BugOff', 'Building', 'Building2', 'Bus', 'BusFront', 'Cable', 'CableCar', 'Cactus', 'Cake', 'CakeSlice',
  'Calculator', 'Calendar', 'CalendarArrowDown', 'CalendarArrowUp', 'CalendarCheck', 'CalendarCheck2', 'CalendarClock', 'CalendarDays', 'CalendarHeart', 'CalendarMinus',
  'CalendarOff', 'CalendarPlus', 'CalendarRange', 'CalendarSearch', 'CalendarX', 'CalendarX2', 'Camera', 'CameraOff', 'CandlestickChart', 'Candy',
  'CandyCane', 'CandyOff', 'Car', 'CarFront', 'CarTaxiFront', 'Caravan', 'Carrot', 'CaseLower', 'CaseSensitive', 'CaseUpper',
  'CassetteTape', 'Cast', 'Castle', 'Cat', 'Cctv', 'Check', 'CheckCheck', 'CheckCircle', 'CheckCircle2', 'CheckSquare',
  'CheckSquare2', 'ChefHat', 'Cherry', 'ChevronDown', 'ChevronDownCircle', 'ChevronDownSquare', 'ChevronFirst', 'ChevronLast', 'ChevronLeft', 'ChevronLeftCircle',
  'ChevronLeftSquare', 'ChevronRight', 'ChevronRightCircle', 'ChevronRightSquare', 'ChevronUp', 'ChevronUpCircle', 'ChevronUpSquare', 'ChevronsDown', 'ChevronsDownUp', 'ChevronsLeft',
  'ChevronsLeftRight', 'ChevronsRight', 'ChevronsRightLeft', 'ChevronsUp', 'ChevronsUpDown', 'Chrome', 'Church', 'Cigarette', 'CigaretteOff', 'Circle',
  'CircleAlert', 'CircleArrowDown', 'CircleArrowLeft', 'CircleArrowOutDownLeft', 'CircleArrowOutDownRight', 'CircleArrowOutUpLeft', 'CircleArrowOutUpRight', 'CircleArrowRight', 'CircleArrowUp', 'CircleCheck',
  'CircleCheckBig', 'CircleChevronDown', 'CircleChevronLeft', 'CircleChevronRight', 'CircleChevronUp', 'CircleDashed', 'CircleDivide', 'CircleDollarSign', 'CircleDot', 'CircleDotDashed',
  'CircleEllipsis', 'CircleEqual', 'CircleFadingArrowUp', 'CircleFadingPlus', 'CircleGauge', 'CircleHelp', 'CircleMinus', 'CircleOff', 'CircleParking', 'CircleParkingOff',
  'CirclePause', 'CirclePercent', 'CirclePlay', 'CirclePlus', 'CirclePower', 'CircleSlash', 'CircleSlash2', 'CircleStop', 'CircleUser', 'CircleUserRound',
  'CircleX', 'CircuitBoard', 'Citrus', 'Clapperboard', 'Clipboard', 'ClipboardCheck', 'ClipboardCopy', 'ClipboardEdit', 'ClipboardList', 'ClipboardMinus',
  'ClipboardPaste', 'ClipboardPen', 'ClipboardPenLine', 'ClipboardPlus', 'ClipboardType', 'ClipboardX', 'Clock', 'Clock1', 'Clock10', 'Clock11',
  'Clock12', 'Clock2', 'Clock3', 'Clock4', 'Clock5', 'Clock6', 'Clock7', 'Clock8', 'Clock9', 'ClockAlerting',
  'ClockArrowDown', 'ClockArrowUp', 'Cloud', 'CloudAlert', 'CloudCheck', 'CloudDownload', 'CloudDrizzle', 'CloudFog', 'CloudHail', 'CloudLightning',
  'CloudMoon', 'CloudMoonRain', 'CloudOff', 'CloudRain', 'CloudRainWind', 'CloudSnow', 'CloudSun', 'CloudSunRain', 'CloudUpload', 'Cloudy',
  'Clover', 'Club', 'Code', 'Code2', 'CodeSquare', 'Codepen', 'Codesandbox', 'Coffee', 'Cog', 'Coins',
  'Columns', 'Combine', 'Command', 'Compass', 'Component', 'Computer', 'ConciergeBell', 'Cone', 'Construction', 'Contact',
  'Contact2', 'ContactRound', 'Container', 'Contrast', 'Cookie', 'CookingPot', 'Copy', 'CopyCheck', 'CopyMinus', 'CopyPlus',
  'CopySlash', 'CopyX', 'Copyleft', 'Copyright', 'CornerDownLeft', 'CornerDownRight', 'CornerLeftDown', 'CornerLeftUp', 'CornerRightDown', 'CornerRightUp',
  'CornerUpLeft', 'CornerUpRight', 'Cpu', 'CreativeCommons', 'CreditCard', 'Croissant', 'Crop', 'Cross', 'Crosshair', 'Crown',
  'Cuboid', 'CupSoda', 'CurlyBraces', 'Currency', 'Dagger', 'Database', 'DatabaseBackup', 'DatabaseZap', 'Delete', 'Dessert',
  'Diameter', 'Dice1', 'Dice2', 'Dice3', 'Dice4', 'Dice5', 'Dice6', 'Dices', 'Diff', 'Disc',
  'Disc2', 'Disc3', 'DiscAlbum', 'Divide', 'Dna', 'DnaOff', 'Dock', 'Dog', 'DollarSign', 'Donut',
  'DoorClosed', 'DoorOpen', 'Dot', 'DotSquare', 'Download', 'DownloadCloud', 'DraftingCompass', 'Drama', 'Dribbble', 'Drill',
  'Droplet', 'Droplets', 'Drum', 'Drumstick', 'Dumbbell', 'Ear', 'EarOff', 'Earth', 'EarthLock', 'Eclipse',
  'Edit', 'Edit2', 'Edit3', 'Egg', 'EggFried', 'EggOff', 'Eject', 'Ellipsis', 'EllipsisVertical', 'Equal',
  'EqualApproximately', 'EqualNot', 'Eraser', 'EthernetPort', 'Euro', 'Expand', 'ExternalLink', 'Eye', 'EyeOff', 'Facebook',
  'Factory', 'Fan', 'FastForward', 'Feather', 'Fence', 'FerrisWheel', 'Figma', 'File', 'FileArchive', 'FileAudio',
  'FileAudio2', 'FileAxis3d', 'FileBadge', 'FileBadge2', 'FileBarChart', 'FileBarChart2', 'FileBox', 'FileCheck', 'FileCheck2', 'FileClock',
  'FileCode', 'FileCode2', 'FileCog', 'FileDiff', 'FileDigit', 'FileDown', 'FileEdit', 'FileHeart', 'FileImage', 'FileInput',
  'FileJson', 'FileJson2', 'FileKey', 'FileKey2', 'FileLineChart', 'FileLock', 'FileLock2', 'FileMinus', 'FileMinus2', 'FileMusic',
  'FileOutput', 'FilePen', 'FilePenLine', 'FilePieChart', 'FilePlus', 'FilePlus2', 'FileQuestion', 'FileScan', 'FileSearch', 'FileSearch2',
  'FileSliders', 'FileSpreadsheet', 'FileStack', 'FileSymlink', 'FileTerminal', 'FileText', 'FileType', 'FileType2', 'FileUp', 'FileVideo',
  'FileVideo2', 'FileVolume', 'FileVolume2', 'FileWarning', 'FileX', 'FileX2', 'Files', 'Film', 'Filter', 'FilterX',
  'Fingerprint', 'FireExtinguisher', 'Fish', 'FishOff', 'FishSymbol', 'Flag', 'FlagOff', 'FlagTriangleLeft', 'FlagTriangleRight', 'Flame',
  'FlameKindling', 'Flashlight', 'FlashlightOff', 'FlaskConical', 'FlaskConicalOff', 'FlaskRound', 'FlipHorizontal', 'FlipHorizontal2', 'FlipVertical', 'FlipVertical2',
  'Flower', 'Flower2', 'Focus', 'FoldHorizontal', 'FoldVertical', 'Folder', 'FolderArchive', 'FolderCheck', 'FolderClock', 'FolderClosed',
  'FolderCode', 'FolderCog', 'FolderDot', 'FolderDown', 'FolderEdit', 'FolderGit', 'FolderGit2', 'FolderHeart', 'FolderInput', 'FolderKanban',
  'FolderKey', 'FolderLock', 'FolderMinus', 'FolderOpen', 'FolderOpenDot', 'FolderOutput', 'FolderPen', 'FolderPlus', 'FolderRoot', 'FolderSearch',
  'FolderSearch2', 'FolderShared', 'FolderSymlink', 'FolderSync', 'FolderTree', 'FolderUp', 'FolderX', 'Folders', 'Footprints', 'ForkKnife',
  'ForkKnifeCross', 'Forklift', 'FormInput', 'Forward', 'Frame', 'Framer', 'Frown', 'Fuel', 'Fullscreen', 'FunctionSquare',
  'GalleryHorizontal', 'GalleryHorizontalEnd', 'GalleryThumbnails', 'GalleryVertical', 'GalleryVerticalEnd', 'Gamepad2', 'Gamepad', 'GanttChart', 'GanttChartSquare', 'Gauge',
  'GaugeCircle', 'Gavel', 'Gem', 'Ghost', 'Gift', 'GitBranch', 'GitBranchPlus', 'GitCommitHorizontal', 'GitCommitVertical', 'GitCompare',
  'GitCompareArrows', 'GitFork', 'GitGraph', 'GitMerge', 'GitPullRequest', 'GitPullRequestArrow', 'GitPullRequestClosed', 'GitPullRequestCreate', 'GitPullRequestCreateArrow', 'GitPullRequestDraft',
  'Github', 'Gitlab', 'GlassWater', 'Glasses', 'Globe', 'Globe2', 'GlobeLock', 'Grab', 'GraduationCap', 'Grape',
  'Grid2x2', 'Grid2x2Check', 'Grid2x2X', 'Grid3x3', 'Grip', 'GripHorizontal', 'GripVertical', 'Group', 'Guitar', 'Ham',
  'Hammer', 'Hand', 'HandCoins', 'HandHeart', 'HandHelping', 'HandMetal', 'HandPlatter', 'Handshake', 'HardDrive', 'HardDriveDownload',
  'HardDriveUpload', 'HardHat', 'Hash', 'Haze', 'HdmiPort', 'Heading', 'Heading1', 'Heading2', 'Heading3', 'Heading4',
  'Heading5', 'Heading6', 'Headphones', 'Heart', 'HeartCrack', 'HeartHandshake', 'HeartOff', 'HeartPulse', 'Heater', 'HelpCircle',
  'HelpingHand', 'Hexagon', 'Highlighter', 'History', 'Home', 'Hop', 'HopOff', 'Hospital', 'Hotel', 'Hourglass',
  'IceCream', 'IceCream2', 'IceCreamBowl', 'IdCard', 'Image', 'ImageCheck', 'ImageDown', 'ImageMinus', 'ImageOff', 'ImagePlus',
  'ImageUp', 'Images', 'Import', 'Inbox', 'Indent', 'IndentDecrease', 'IndentIncrease', 'IndianRupee', 'Infinity', 'Info',
  'Inspect', 'InspectionPanel', 'Instagram', 'Italic', 'IterationCcw', 'IterationCw', 'JapaneseYen', 'Joystick', 'Kanban', 'KanbanSquare',
  'KanbanSquareDashed', 'Key', 'KeyCircle', 'KeyRound', 'KeySquare', 'Keyframe', 'KeyframeAlignCenter', 'KeyframeAlignHorizontal', 'KeyframeAlignVertical', 'Keyframes',
  'Ladder', 'Lamp', 'LampCeiling', 'LampDesk', 'LampFloor', 'LampWallDown', 'LampWallUp', 'LandPlot', 'Landmark', 'Languages',
  'Laptop', 'Laptop2', 'LaptopMinimal', 'Lasso', 'LassoSelect', 'Laugh', 'Layers', 'Layers2', 'Layers3', 'Layout',
  'LayoutDashboard', 'LayoutGrid', 'LayoutList', 'LayoutPanelLeft', 'LayoutPanelTop', 'LayoutTemplate', 'Leaf', 'LeafyGreen', 'Lectern', 'LetterText',
  'Library', 'LibraryBig', 'LifeBuoy', 'Ligature', 'Lightbulb', 'LightbulbOff', 'LineChart', 'Link', 'Link2', 'Link2Off',
  'Linkedin', 'List', 'ListCheck', 'ListChecks', 'ListCollapse', 'ListEnd', 'ListFilter', 'ListMusic', 'ListOrdered', 'ListPlus',
  'ListRestart', 'ListStart', 'ListTodo', 'ListTree', 'ListVideo', 'ListX', 'Loader', 'Loader2', 'LoaderCircle', 'LoaderPinwheel',
  'Locate', 'LocateFixed', 'LocateOff', 'Lock', 'LockKeyhole', 'LockKeyholeOpen', 'LockOpen', 'LogIn', 'LogOut', 'Logs',
  'Lollipop', 'Luggage', 'MSquare', 'Magnet', 'Mail', 'MailCheck', 'MailMinus', 'MailOpen', 'MailPlus', 'MailQuestion',
  'MailSearch', 'MailWarning', 'MailX', 'Mailbox', 'Mails', 'Map', 'MapPin', 'MapPinCheck', 'MapPinCheckInside', 'MapPinHouse',
  'MapPinMinus', 'MapPinMinusInside', 'MapPinOff', 'MapPinPlus', 'MapPinPlusInside', 'MapPinX', 'MapPinXInside', 'MapPinned', 'Martini', 'Maximize',
  'Maximize2', 'Medal', 'Megaphone', 'MegaphoneOff', 'Meh', 'MemoryStick', 'Menu', 'Merge', 'MessageCircle', 'MessageCircleCode',
  'MessageCircleDashed', 'MessageCircleHeart', 'MessageCircleMore', 'MessageCircleOff', 'MessageCirclePlus', 'MessageCircleQuestion', 'MessageCircleReply', 'MessageCircleWarning', 'MessageCircleX', 'MessageSquare',
  'MessageSquareCode', 'MessageSquareDashed', 'MessageSquareDiff', 'MessageSquareDot', 'MessageSquareHeart', 'MessageSquareMore', 'MessageSquareOff', 'MessageSquarePlus', 'MessageSquareQuote', 'MessageSquareReply',
  'MessageSquareShare', 'MessageSquareText', 'MessageSquareWarning', 'MessageSquareX', 'MessagesSquare', 'Mic', 'Mic2', 'MicOff', 'Microscope', 'Microwave',
  'Milk', 'MilkOff', 'Minimize', 'Minimize2', 'Minus', 'MinusCircle', 'MinusSquare', 'Monitor', 'MonitorCheck', 'MonitorCog',
  'MonitorDot', 'MonitorDown', 'MonitorOff', 'MonitorPause', 'MonitorPlay', 'MonitorSmartphone', 'MonitorSpeaker', 'MonitorStop', 'MonitorUp', 'MonitorX',
  'Moon', 'MoonStar', 'MoreHorizontal', 'MoreVertical', 'Mountain', 'MountainSnow', 'Mouse', 'MousePointer', 'MousePointer2', 'MousePointerBan',
  'MousePointerClick', 'MousePointerSquare', 'MousePointerSquareDashed', 'Move', 'Move3d', 'MoveDiagonal', 'MoveDiagonal2', 'MoveDown', 'MoveDownLeft', 'MoveDownRight',
  'MoveHorizontal', 'MoveLeft', 'MoveRight', 'MoveUp', 'MoveUpLeft', 'MoveUpRight', 'MoveVertical', 'Music', 'Music2', 'Music3',
  'Music4', 'Navigation', 'Navigation2', 'Navigation2Off', 'NavigationOff', 'Network', 'Newspaper', 'Nfc', 'Notebook', 'NotebookPen',
  'NotebookTabs', 'NotebookText', 'NotepadText', 'NotepadTextDashed', 'Nut', 'NutOff', 'Octagon', 'OctagonAlert', 'OctagonMinus', 'OctagonPause',
  'OctagonX', 'Option', 'Orbit', 'Origami', 'Outdent', 'Package', 'Package2', 'PackageCheck', 'PackageMinus', 'PackageOpen',
  'PackagePlus', 'PackageSearch', 'PackageX', 'Packed', 'Packing', 'Pails', 'Paintbrush', 'Paintbrush2', 'PaintbrushVertical', 'PaintRoller',
  'Palette', 'Palmtree', 'PanelBottom', 'PanelBottomClose', 'PanelBottomDashed', 'PanelBottomOpen', 'PanelLeft', 'PanelLeftClose', 'PanelLeftDashed', 'PanelLeftOpen',
  'PanelRight', 'PanelRightClose', 'PanelRightDashed', 'PanelRightOpen', 'PanelTop', 'PanelTopClose', 'PanelTopDashed', 'PanelTopOpen', 'PanelsLeftBottom', 'PanelsLeftRight',
  'PanelsRightBottom', 'PanelsTopBottom', 'PanelsTopLeft', 'Paperclip', 'Parentheses', 'ParkingCircle', 'ParkingCircleOff', 'ParkingMeter', 'ParkingSquare', 'ParkingSquareOff',
  'PartyPopper', 'Pause', 'PauseCircle', 'PawPrint', 'PcCase', 'Pen', 'PenLine', 'PenOff', 'PenSquare', 'PenTool',
  'Pencil', 'PencilLine', 'PencilOff', 'PencilRuler', 'Pennant', 'Pentagon', 'Percent', 'PersonStanding', 'Phone', 'PhoneCall',
  'PhoneForwarded', 'PhoneIncoming', 'PhoneMissed', 'PhoneOff', 'PhoneOutgoing', 'PieChart', 'PiggyBank', 'Pilcrow', 'PilcrowLeft', 'PilcrowRight',
  'Pill', 'PillBottle', 'Pin', 'PinOff', 'Pipette', 'Pizza', 'Plane', 'PlaneLanding', 'PlaneTakeoff', 'Play',
  'PlayCircle', 'Plug', 'Plug2', 'PlugZap', 'PlugZap2', 'Plus', 'PlusCircle', 'PlusSquare', 'Pocket', 'PocketKnife',
  'Podcast', 'Pointer', 'PointerOff', 'Popcorn', 'Popsicle', 'PoundSterling', 'Power', 'PowerCircle', 'PowerOff', 'PowerSquare',
  'Presentation', 'Printer', 'PrinterCheck', 'Projector', 'Proportions', 'Puzzle', 'Pyramid', 'QrCode', 'Quote', 'Rabbit',
  'Radar', 'Radiation', 'Radical', 'Radio', 'RadioReceiver', 'RadioTower', 'Radius', 'RailSymbol', 'Rainbow', 'Rat',
  'Ratio', 'Receipt', 'ReceiptCent', 'ReceiptEuro', 'ReceiptIndianRupee', 'ReceiptJapaneseYen', 'ReceiptPoundSterling', 'ReceiptRussianRuble', 'ReceiptSwissFranc', 'ReceiptText',
  'RectangleEllipsis', 'RectangleHorizontal', 'RectangleVertical', 'Recycle', 'Redo', 'Redo2', 'RedoDot', 'RefreshCw', 'RefreshCcw', 'Refrigerator',
  'Regex', 'RemoveFormatting', 'Repeat', 'Repeat1', 'Repeat2', 'Replace', 'ReplaceAll', 'Reply', 'ReplyAll', 'Rewind',
  'Ribbon', 'Rocket', 'RockingChair', 'RollerCoaster', 'Rotate3d', 'RotateCcw', 'RotateCcwSquare', 'RotateCw', 'RotateCwSquare', 'Route',
  'RouteOff', 'Router', 'Rows', 'Rows2', 'Rows3', 'Rows4', 'Rss', 'Ruler', 'RussianRuble', 'Sailboat',
  'Salad', 'Sandwich', 'Satellite', 'SatelliteDish', 'Save', 'SaveAll', 'SaveOff', 'Scale', 'Scale3d', 'Scaling',
  'Scan', 'ScanBarcode', 'ScanEye', 'ScanFace', 'ScanLine', 'ScanQrCode', 'ScanSearch', 'ScanText', 'School', 'School2',
  'Scissors', 'ScissorsLineDashed', 'ScreenShare', 'ScreenShareOff', 'Scroll', 'ScrollText', 'Search', 'SearchCheck', 'SearchCode', 'SearchSlash',
  'SearchX', 'Section', 'Send', 'SendHorizontal', 'SendToBack', 'SeparatorHorizontal', 'SeparatorVertical', 'Server', 'ServerCog', 'ServerCrash',
  'ServerOff', 'Settings', 'Settings2', 'Shapes', 'Share', 'Share2', 'Share3', 'Sheet', 'Shell', 'Shield',
  'ShieldAlert', 'ShieldBan', 'ShieldCheck', 'ShieldClose', 'ShieldEllipsis', 'ShieldHalf', 'ShieldMinus', 'ShieldOff', 'ShieldPlus', 'ShieldQuestion',
  'ShieldX', 'Ship', 'ShipWheel', 'Shirt', 'ShoppingBag', 'ShoppingBasket', 'ShoppingCart', 'Shovel', 'ShowerHead', 'Shrink',
  'Shrub', 'Shuffle', 'Sidebar', 'SidebarClose', 'SidebarOpen', 'Sigma', 'Signpost', 'SignpostBig', 'Siren', 'SkipBack',
  'SkipForward', 'Skull', 'Slack', 'Slash', 'Slice', 'Sliders', 'SlidersHorizontal', 'SlidersVertical', 'Smartphone', 'SmartphoneCharging',
  'SmartphoneNfc', 'Smile', 'SmilePlus', 'Snail', 'Snowflake', 'Sofa', 'SortAsc', 'SortDesc', 'SortHorizontal', 'SortVertical',
  'Soup', 'Space', 'Spacing', 'Spade', 'Sparkle', 'Sparkles', 'Speaker', 'Speech', 'SpellCheck', 'SpellCheck2',
  'Spline', 'Split', 'SplitSquareHorizontal', 'SplitSquareVertical', 'SprayCan', 'Sprout', 'Square', 'SquareActivity', 'SquareArrowDown', 'SquareArrowDownLeft',
  'SquareArrowDownRight', 'SquareArrowLeft', 'SquareArrowOutDownLeft', 'SquareArrowOutDownRight', 'SquareArrowOutUpLeft', 'SquareArrowOutUpRight', 'SquareArrowRight', 'SquareArrowUp', 'SquareArrowUpLeft', 'SquareArrowUpRight',
  'SquareAsterisk', 'SquareBottomDashedScissors', 'SquareChartGantt', 'SquareCheck', 'SquareCheckBig', 'SquareChevronDown', 'SquareChevronLeft', 'SquareChevronRight', 'SquareChevronUp', 'SquareCode',
  'SquareDashedBottom', 'SquareDashedBottomCode', 'SquareDashedKanban', 'SquareDashedMousePointer', 'SquareDivide', 'SquareDot', 'SquareEqual', 'SquareFunction', 'SquareGanttChart', 'SquareKanban',
  'SquareLibrary', 'SquareM', 'SquareMenu', 'SquareMinus', 'SquareMousePointer', 'SquareParking', 'SquareParkingOff', 'SquarePen', 'SquarePercent', 'SquarePi',
  'SquarePilcrow', 'SquarePlay', 'SquarePlus', 'SquarePower', 'SquareRadical', 'SquareScissors', 'SquareSigma', 'SquareSlash', 'SquareSplitHorizontal', 'SquareSplitVertical',
  'SquareStack', 'SquareTerminal', 'SquareUser', 'SquareUserRound', 'SquareX', 'Squircle', 'Squirrel', 'Stamp', 'Star', 'StarHalf',
  'StarOff', 'Stars', 'StepBack', 'StepForward', 'Stethoscope', 'Sticker', 'StickyNote', 'StopCircle', 'Store', 'StretchHorizontal',
  'StretchVertical', 'Strikethrough', 'Subscript', 'Subtitles', 'Sun', 'SunDim', 'SunMedium', 'SunMoon', 'SunSnow', 'Sunrise',
  'Sunset', 'Superscript', 'SwatchBook', 'SwissFranc', 'SwitchCamera', 'Sword', 'Swords', 'Syringe', 'Table', 'Table2',
  'TableCellsMerge', 'TableCellsSplit', 'TableColumnsSplit', 'TableProperties', 'TableRowsSplit', 'Tablet', 'TabletSmartphone', 'Tablets', 'Tag', 'Tags',
  'Tally1', 'Tally2', 'Tally3', 'Tally4', 'Tally5', 'Tangent', 'Target', 'Telescope', 'Tent', 'TentTree',
  'Terminal', 'TerminalSquare', 'TestTube', 'TestTube2', 'TestTubes', 'Text', 'TextCursor', 'TextCursorInput', 'TextQuote', 'TextSearch',
  'TextSelect', 'TextSelection', 'Theater', 'Thermometer', 'ThermometerSnowflake', 'ThermometerSun', 'ThumbsDown', 'ThumbsUp', 'Ticket', 'TicketCheck',
  'TicketMinus', 'TicketPercent', 'TicketPlus', 'TicketSlash', 'TicketX', 'Tickets', 'TicketsPlane', 'Timer', 'TimerOff', 'TimerReset',
  'ToggleLeft', 'ToggleRight', 'Tornado', 'Torus', 'Touchpad', 'TouchpadOff', 'TowerControl', 'ToyBrick', 'Tractor', 'TrafficCone',
  'Train', 'TrainFront', 'TrainFrontTunnel', 'TrainTrack', 'TramFront', 'Transform', 'Trash', 'Trash2', 'TreeDeciduous', 'TreePine',
  'Trees', 'Trello', 'TrendingDown', 'TrendingUp', 'Triangle', 'TriangleAlert', 'TriangleRight', 'TriangleDashed', 'Trophy', 'Truck',
  'Turtle', 'Tv', 'Tv2', 'Twitch', 'Twitter', 'Type', 'Umbrella', 'UmbrellaOff', 'Underline', 'Undo',
  'Undo2', 'UndoDot', 'UnfoldHorizontal', 'UnfoldVertical', 'Ungroup', 'University', 'Unlink', 'Unlink2', 'Unlock', 'UnlockKeyhole',
  'Unplug', 'Upload', 'UploadCloud', 'Usb', 'User', 'User2', 'UserCheck', 'UserCircle', 'UserCircle2', 'UserCog',
  'UserMinus', 'UserPlus', 'UserRound', 'UserRoundCheck', 'UserRoundCog', 'UserRoundMinus', 'UserRoundPlus', 'UserRoundSearch', 'UserRoundX', 'UserSearch',
  'UserSquare', 'UserSquare2', 'UserX', 'Users', 'UsersRound', 'Utensils', 'UtensilsCrossed', 'UtilityPole', 'UtilityPoleCheck', 'Variable',
  'Vault', 'Vegan', 'VenetianMask', 'Verified', 'Vibrate', 'VibrateOff', 'Video', 'VideoOff', 'Videotape', 'View',
  'Voicemail', 'Volleyball', 'Volume', 'Volume1', 'Volume2', 'VolumeX', 'Vote', 'Wallet', 'Wallet2', 'WalletCards',
  'Wallpaper', 'Wand', 'Wand2', 'Warehouse', 'WashingMachine', 'Watch', 'Waves', 'Waypoints', 'Webcam', 'Webhook',
  'WebhookOff', 'Weight', 'Wheat', 'WheatOff', 'WholeWord', 'Wifi', 'WifiHigh', 'WifiLow', 'WifiOff', 'WifiZero',
  'Wind', 'Wine', 'WineOff', 'Workflow', 'Worm', 'WrapText', 'Wrench', 'X', 'XCircle', 'XOctagon',
  'XSquare', 'Youtube', 'Zap', 'ZapOff', 'ZoomIn', 'ZoomOut',
]);

console.log('🔍 Scanning ALL files in src/pages/ and src/components/ for missing lucide-react icon imports...\n');

const rootDir = path.resolve(__dirname, '..');
const dirs = ['src/pages', 'src/components'];

let totalFiles = 0;
let filesWithIssues = 0;
let totalMissingImports = 0;
const fileResults = [];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(rootDir, filePath);

  // Find the import block
  const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
  if (!importMatch) return; // No lucide-react import

  totalFiles++;

  // Extract imported icon names
  const importedIcons = importMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^type\s+/, ''))
    .filter(Boolean);

  const importedSet = new Set(importedIcons);

  // Find all potential icon usages (as JSX components or variable references)
  // Match patterns like: <IconName, IconName, icon: IconName, icon: {IconName
  // But EXCLUDE type annotations like: LucideIcon, : IconName (type annotation)
  const potentialIconRefs = [...content.matchAll(/\b([A-Z][a-zA-Z]*)\b/g)];
  
  // Also match icon usages in JSX: <IconName .../> or <IconName> or <IconName.
  const jsxIconRefs = [...content.matchAll(/<([A-Z][a-zA-Z0-9]*)[\s/>]/g)];
  
  // Also match object values: { icon: IconName } or icon: IconName
  const objIconRefs = [...content.matchAll(/:\s*([A-Z][a-zA-Z0-9]*)\s*[,})]/g)];

  // Combine all potential refs, filter to those that look like icons
  const allRefs = [
    ...potentialIconRefs.map(m => m[1]),
    ...jsxIconRefs.map(m => m[1]),
    ...objIconRefs.map(m => m[1]),
  ];

  // Get unique potential icon names (must start with capital letter and be in our known set or commonly used)
  const usedIconNames = [...new Set(allRefs)]
    .filter(name => 
      name.length > 1 && 
      COMMON_ICONS.has(name) && 
      !importedSet.has(name) &&
      name !== 'Boolean' && name !== 'Number' && name !== 'String' && 
      name !== 'Array' && name !== 'Object' && name !== 'Function' &&
      name !== 'Date' && name !== 'RegExp' && name !== 'Map' && name !== 'Set' &&
      name !== 'Promise' && name !== 'Error' && name !== 'Symbol' &&
      name !== 'Component' && name !== 'Element' && name !== 'React' &&
      name !== 'Node' && name !== 'Children' && name !== 'Fragment' &&
      name !== 'HTML' && name !== 'CSS' && name !== 'JSON' &&
      name !== 'URL' && name !== 'File' && name !== 'FormData' &&
      name !== 'FileList' && name !== 'Blob' && name !== 'Headers' &&
      name !== 'Request' && name !== 'Response' && name !== 'Text' &&
      name !== 'Font' && name !== 'Color' && name !== 'Style' &&
      name !== 'Key' && name !== 'Ref' && name !== 'Context' &&
      name !== 'Provider' && name !== 'Consumer' && name !== 'Memo' &&
      name !== 'ForwardRef' && name !== 'Lazy' && name !== 'Suspense' &&
      name !== 'StrictMode' && name !== 'Profiler' && name !== 'Portal' &&
      name !== 'Row' && name !== 'Col' && name !== 'Flex' &&
      name !== 'Box' && name !== 'Grid' && name !== 'Card' &&
      name !== 'Div' && name !== 'Span' && name !== 'Img' &&
      name !== 'Input' && name !== 'Form' && name !== 'Label' &&
      name !== 'Select' && name !== 'Option' && name !== 'Button' &&
      name !== 'Table' && name !== 'Thead' && name !== 'Tbody' &&
      name !== 'Th' && name !== 'Td' && name !== 'Tr' &&
      name !== 'P' && name !== 'H1' && name !== 'H2' && name !== 'H3' &&
      name !== 'H4' && name !== 'H5' && name !== 'H6' &&
      name !== 'Nav' && name !== 'Head' && name !== 'Body' &&
      name !== 'Main' && name !== 'Section' && name !== 'Article' &&
      name !== 'Aside' && name !== 'Footer' && name !== 'Header' &&
      name !== 'Figure' && name !== 'Figcaption' && name !== 'Time'
    );

  if (usedIconNames.length > 0) {
    filesWithIssues++;
    totalMissingImports += usedIconNames.length;
    fileResults.push({ file: relativePath, missing: usedIconNames });
    console.log(`❌ ${relativePath}: Missing ${usedIconNames.length} icon(s): ${usedIconNames.join(', ')}`);

    // Auto-fix if --fix flag is set
    if (shouldFix) {
      const existingImport = importMatch[0];
      const existingIcons = importMatch[1].trim();
      
      // Add missing icons to the import (alphabetically)
      const allIcons = [...new Set([...importedIcons, ...usedIconNames])].sort();
      const newImport = `import { ${allIcons.join(',\n  ')} } from 'lucide-react'`;
      
      // If the import is a single line, respect that format
      if (existingImport.includes('\n')) {
        // Multi-line import - keep format
        const updatedContent = content.replace(existingImport, `import {\n  ${allIcons.join(',\n  ')},\n} from 'lucide-react'`);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
      } else {
        // Single-line import - keep format
        const updatedContent = content.replace(existingImport, newImport);
        fs.writeFileSync(filePath, updatedContent, 'utf-8');
      }
      
      console.log(`   ✅ Fixed: Added ${usedIconNames.join(', ')}`);
    }
  } else {
    console.log(`✅ ${relativePath}: All icons imported correctly`);
  }
}

// Scan all files
for (const dir of dirs) {
  const fullDir = path.join(rootDir, dir);
  if (!fs.existsSync(fullDir)) continue;

  const files = [];
  function walkDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  walkDir(fullDir);

  for (const file of files) {
    scanFile(file);
  }
}

console.log('\n═══════════════════════════════════════════');
console.log('📊 SCAN RESULTS');
console.log('═══════════════════════════════════════════');
console.log(`📁 Files scanned: ${totalFiles}`);
console.log(`❌ Files with missing imports: ${filesWithIssues}`);
console.log(`🔴 Total missing icon imports: ${totalMissingImports}`);
console.log(`🛠️  Auto-fix mode: ${shouldFix ? 'ENABLED' : 'DISABLED (use --fix to enable)'}`);

if (filesWithIssues > 0 && !shouldFix) {
  console.log('\n⚠️  To auto-fix all issues, run: node scripts/scan-icons.js --fix');
}

if (filesWithIssues === 0) {
  console.log('\n✅ PERFECT! ALL lucide-react icon imports are correct across the entire codebase!');
}

// Output detailed report
if (fileResults.length > 0) {
  console.log('\n📋 DETAILED REPORT:');
  console.log('────────────────────────────────────────────');
  for (const result of fileResults) {
    console.log(`\n📄 ${result.file}:`);
    result.missing.forEach(icon => console.log(`   ➕ Add: ${icon}`));
  }
}
