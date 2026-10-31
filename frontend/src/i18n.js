// Words on the customer's shop page, in English and Hindi. Names and prices from the shop stay as the owner wrote them.
// To add a language, add another block with the same keys. A missing key falls back to English.
const STRINGS = {
  en: {
    chat: 'Chat', cart: 'Cart', orders: 'Orders',
    'menu.Menu': 'Menu', 'menu.Products': 'Products', 'menu.Medicines': 'Medicines', 'menu.Services': 'Services', 'menu.Items': 'Items',
    greeting: 'Hi! Welcome to {name}. Ask me anything, or open {menu} to browse and add to your cart.',
    placeholder: 'Type your message...', send: 'Send', typing: 'typing...',
    footer: "Answers come from the shop's own information.",
    owner: 'Shop owner',
    leadOk: '✓ Sent to the shop. They will contact you.',
    cartUpdated: '🛒 Cart updated: {items}', removed: 'removed {name}', viewCart: 'View cart',
    detailsFilled: '✓ Your details are filled in on the Cart tab.',
    orderSent: 'Your order #{n} for {amount} was sent to the shop. They will confirm it soon.',
    orderLine: '✓ Order #{n}: {amount}', pay: 'Pay {amount} with UPI', opensUpi: 'Opens your UPI app on your phone.',
    notFound: 'Shop not found', notFoundHint: 'Check the link and try again.', loading: 'Loading...',
    searchIn: 'Search {menu}...', add: 'Add', notAvailable: 'Not available',
    nothingYet: 'Nothing has been added here yet. Ask the assistant in the chat.', noMatch: 'Nothing matches "{q}".',
    cartBar: 'View cart · {amount}', itemsCount: '🛒 {n} items', other: 'Other',
    yourCart: 'Your cart', empty: 'Your cart is empty.', browse: 'Browse {menu}', total: 'Total', each: '{unit} · {price} each',
    'mode.delivery': 'Delivery', 'mode.pickup': 'Pickup', 'mode.dinein': 'Dine-in', 'mode.appointment': 'Book appointment',
    'ph.name': 'Your name', 'ph.phone': 'Phone number', 'ph.address': 'Full delivery address',
    'ph.dinein': 'Table number or arrival time', 'ph.appointment': 'Preferred date and time (e.g. Saturday 4 pm)',
    'ph.pickup': 'Pickup time (optional)', 'ph.note': 'Note (optional)',
    weDeliver: 'We deliver to: {areas}', place: 'Place order · {amount}', book: 'Book appointment · {amount}', wait: 'Please wait...',
    confirmNote: 'The shop confirms the final amount.', payNote: ' You can pay by UPI after ordering.',
    noOrders: 'No orders yet. Tell the assistant what you want to buy.',
    'status.pending': 'New', 'status.accepted': 'Accepted', 'status.out_for_delivery': 'Out for delivery', 'status.delivered': 'Delivered', 'status.cancelled': 'Cancelled',
    'sched.appointment': 'Appointment', 'sched.dinein': 'Dine-in', 'sched.pickup': 'Pickup',
    ratePh: 'Any comment? (optional)', sendRating: 'Send rating', thanks: 'Thanks! You rated {stars}',
  },
  hi: {
    chat: 'चैट', cart: 'कार्ट', orders: 'ऑर्डर',
    'menu.Menu': 'मेन्यू', 'menu.Products': 'प्रोडक्ट्स', 'menu.Medicines': 'दवाइयाँ', 'menu.Services': 'सेवाएँ', 'menu.Items': 'आइटम',
    greeting: 'नमस्ते! {name} में आपका स्वागत है। कुछ भी पूछें, या {menu} खोलकर देखें और कार्ट में जोड़ें।',
    placeholder: 'अपना संदेश लिखें...', send: 'भेजें', typing: 'लिख रहा है...',
    footer: 'जवाब दुकान की अपनी जानकारी से आते हैं।',
    owner: 'दुकानदार',
    leadOk: '✓ दुकान को भेज दिया गया। वे आपसे संपर्क करेंगे।',
    cartUpdated: '🛒 कार्ट अपडेट हुआ: {items}', removed: '{name} हटाया गया', viewCart: 'कार्ट देखें',
    detailsFilled: '✓ आपकी जानकारी कार्ट टैब में भर दी गई है।',
    orderSent: 'आपका ऑर्डर #{n} ({amount}) दुकान को भेज दिया गया है। वे जल्दी ही इसे कन्फर्म करेंगे।',
    orderLine: '✓ ऑर्डर #{n}: {amount}', pay: '{amount} UPI से भरें', opensUpi: 'यह आपके फ़ोन में UPI ऐप खोलेगा।',
    notFound: 'दुकान नहीं मिली', notFoundHint: 'लिंक जाँचकर फिर कोशिश करें।', loading: 'लोड हो रहा है...',
    searchIn: '{menu} में खोजें...', add: 'जोड़ें', notAvailable: 'उपलब्ध नहीं',
    nothingYet: 'यहाँ अभी कुछ नहीं जोड़ा गया है। चैट में असिस्टेंट से पूछें।', noMatch: '"{q}" से कुछ नहीं मिला।',
    cartBar: 'कार्ट देखें · {amount}', itemsCount: '🛒 {n} आइटम', other: 'अन्य',
    yourCart: 'आपका कार्ट', empty: 'आपका कार्ट खाली है।', browse: '{menu} देखें', total: 'कुल', each: '{unit} · {price} प्रति',
    'mode.delivery': 'डिलीवरी', 'mode.pickup': 'पिकअप', 'mode.dinein': 'डाइन-इन', 'mode.appointment': 'अपॉइंटमेंट बुक करें',
    'ph.name': 'आपका नाम', 'ph.phone': 'फ़ोन नंबर', 'ph.address': 'पूरा डिलीवरी पता',
    'ph.dinein': 'टेबल नंबर या आने का समय', 'ph.appointment': 'पसंदीदा तारीख और समय (जैसे शनिवार शाम 4 बजे)',
    'ph.pickup': 'पिकअप का समय (वैकल्पिक)', 'ph.note': 'नोट (वैकल्पिक)',
    weDeliver: 'हम यहाँ डिलीवर करते हैं: {areas}', place: 'ऑर्डर करें · {amount}', book: 'अपॉइंटमेंट बुक करें · {amount}', wait: 'कृपया रुकें...',
    confirmNote: 'अंतिम रकम दुकान कन्फर्म करेगी।', payNote: ' ऑर्डर के बाद आप UPI से भुगतान कर सकते हैं।',
    noOrders: 'अभी कोई ऑर्डर नहीं। असिस्टेंट को बताएँ कि आपको क्या खरीदना है।',
    'status.pending': 'नया', 'status.accepted': 'स्वीकृत', 'status.out_for_delivery': 'डिलीवरी के लिए निकला', 'status.delivered': 'डिलीवर हुआ', 'status.cancelled': 'रद्द',
    'sched.appointment': 'अपॉइंटमेंट', 'sched.dinein': 'डाइन-इन', 'sched.pickup': 'पिकअप',
    ratePh: 'कुछ कहना है? (वैकल्पिक)', sendRating: 'रेटिंग भेजें', thanks: 'धन्यवाद! आपने {stars} रेटिंग दी',
  },
};

export const LANGS = [
  ['en', 'English'],
  ['hi', 'हिंदी'],
];

// The first time, use Hindi if the phone's language is Hindi. After that, the customer's choice.
export function initialLang() {
  const saved = localStorage.getItem('shop_lang');
  if (saved === 'en' || saved === 'hi') return saved;
  return (navigator.language || '').toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

// t('greeting', { name: 'Sharma Store' }) -> the text in the chosen language
export function makeT(lang) {
  return (key, vars = {}) => {
    const text = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
  };
}
