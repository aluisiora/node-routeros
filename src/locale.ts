import { normalize } from 'path';
import * as i18n from 'i18next';

i18n.init({
        initImmediate: false,
        lng: 'en',
        fallbackLng: 'en',
        backend: {
            loadPath: normalize(__dirname + '/../locales/{{lng}}.json'),
            addPath: normalize(__dirname + '/../locales/{{lng}}.missing.json'),
            jsonIndent: 2
        }
    });

export default i18n;
