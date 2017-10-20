import { normalize } from 'path';
import * as i18n from 'i18next';
import * as backend from 'i18next-sync-fs-backend';

i18n
    .use(backend)
    .init({
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
