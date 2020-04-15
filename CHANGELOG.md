# Changelog

## 1.6.3 (2019-09-02)

-   Handle authentication challenge buffer as 16 bit.

## 1.6.0 (2019-01-02)

-   Added `writeStream` function which returns an `RStream` object to optionally stream content by listening to the events:
    -   `data`
    -   `trap`
    -   `done`
    -   `close`

## 1.5.1 (2018-10-25)

-   Added ability to login to 6.43+ firmware with fallback to challenge / response method
-   Added TLS option for no certificates to test suite for SSL test to pass (from pull request #7)

        ciphers: 'ADH-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384'

## 1.4.0 (2018-03-06)

-   Localization support removed.
