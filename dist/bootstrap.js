import * as i18n from 'i18n';
i18n.configure({
    directory: __dirname + '/locales',
    locales: ['en_US', 'pt_BR'],
});
i18n.setLocale('en_US');
const lang = i18n.__;
