# Discontinued

***I worked on this project in my spare time, but unfortunately I no longer work with mikrotik devices and don't have the free time anymore, so consider it as discontinued. Feel free to fork this project and create your own spin.***

# Description

This is a Mikrotik Routerboard API written in Typescript for nodejs, can be either used with plain javascript or imported on typescript projects.

This library will handle the API in a more lowerlevel way, for a simpler to use interface I recommend my [`routeros-client`](https://github.com/aluisiora/routeros-client) for a more "object-oriented" API, which wraps this API. It has a very rich documentation, so please check it out.

# Features

-   Connection and reconnection without destroying the object.
-   Change host, username and other parameters of the object without recreating it.
-   Based on promises.
-   You can choose to keep the connection alive if it gets idle.
-   Every command is async, but can be synced using the promises features.
-   Can pause, resume and stop streams (like what you get from /tool/torch).
-   Support languages with accents, keeping it consistent throughout winbox and api.

# Installing

```
npm install node-routeros --save
```

# Documentation

Check the [wiki](https://github.com/aluisiora/node-routeros/wiki) for a complete documentation.

# Examples

You can import in TypeScript using:

```typescript
import { RouterOSAPI } from 'node-routeros';
```

Adding an IP address to ether2, printing it, then removing it synchronously:

```javascript
const RosApi = require('node-routeros').RouterOSAPI;

const conn = new RosApi({
    host: '192.168.88.1',
    user: 'admin',
    password: '',
});

conn.connect()
    .then(() => {
        // Connection successful

        // Let's add an IP address to ether2
        conn.write('/ip/address/add', [
            '=interface=ether2',
            '=address=192.168.90.1',
        ])
            .then((data) => {
                console.log('192.168.90.1 added to ether2!', data);

                // Added the ip address, let's print it
                return conn.write('/ip/address/print', ['?.id=' + data[0].ret]);
            })
            .then((data) => {
                console.log('Printing address info: ', data);

                // We got the address added, let's clean it up
                return conn.write('/ip/address/remove', [
                    '=.id=' + data[0]['.id'],
                ]);
            })
            .then((data) => {
                console.log('192.168.90.1 as removed from ether2!', data);

                // The address was removed! We are done, let's close the connection
                conn.close();
            })
            .catch((err) => {
                // Oops, got an error
                console.log(err);
            });
    })
    .catch((err) => {
        // Got an error while trying to connect
        console.log(err);
    });
```

Listening data from /ip/torch and using pause/resume/stop feature:

```javascript
const RosApi = require("node-routeros").RouterOSAPI;

const conn = new RosApi({
    host: "192.168.88.1",
    user: "admin"
    password: ""
});

conn.connect().then(() => {
    // Counter to trigger pause/resume/stop
    let i = 0;

    // The stream function returns a Stream object which can be used to pause/resume/stop the stream
    const addressStream = conn.stream(['/tool/torch', '=interface=ether1'], (error, packet) => {
        // If there is any error, the stream stops immediately
        if (!error) {
            console.log(packet);

            // Increment the counter
            i++;

            // if the counter hits 30, we stop the stream
            if (i === 30) {

                // Stopping the stream will return a promise
                addressStream.stop().then(() => {
                    console.log('should stop');
                    // Once stopped, you can't start it again
                    conn.close();
                }).catch((err) => {
                    console.log(err);
                });

            } else if (i % 5 === 0) {

                // If the counter is multiple of 5, we will pause it
                addressStream.pause().then(() => {
                    console.log('should be paused');

                    // And after it is paused, we resume after 3 seconds
                    setTimeout(() => {
                        addressStream.resume().then(() => {
                            console.log('should resume');
                        }).catch((err) => {
                            console.log(err);
                        });
                    }, 3000);

                }).catch((err) => {
                    console.log(err);
                });

            }

        }else{
            console.log(error);
        }
    });

}).catch((err) => {
    // Got an error while trying to connect
    console.log(err);
});
```

# Cloning this repo

Note that, if are cloning this repo, you must be familiar with [Typescript](https://www.typescriptlang.org/) so you can make your changes.

## Testing

In order to run the tests, I used [RouterOS CHR](https://mikrotik.com/download) on a virtual machine with 4 interfaces, where the first interface is a bridge of my network card:

![VirtualBox RouterOS CHR Conf](https://raw.githubusercontent.com/aluisiora/routeros-client/master/images/routeros-chr-interfaces.gif)

# TODO

-   Write more tests

# Credits

This project is entirely based on [George Joseph](https://github.com/f5eng/mikronode-ng) and [Brandon Myers](https://github.com/Trakkasure/mikronode)'s work with `mikronode`, thank you very much!!!

# License

MIT License

Copyright (c) 2017 Aluísio Rodrigues Amaral

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
