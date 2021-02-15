const puppeteer = require('puppeteer');
const fs = require('fs');
const fetch = require('fetch');


(async() => {
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    let dlPage = await browser.newPage();
    dlPage.on('console', msg => console.log(msg.text()));
    await dlPage.exposeFunction('fetchStream', async(streamPath, streamName, savePath) => {
        return new Promise((resolve, reject) => {
            var out = fs.createWriteStream(`${savePath}//${streamName}.mp3`);
            new fetch.FetchStream(streamPath).pipe(out);
            resolve(true)
        });
    });
    const discoPage = await browser.newPage();
    await discoPage.goto('https://band-dl-camp.xom/music', { waitUntil: 'networkidle2' });
    discoPage.on('console', msg => console.log(msg.text()));
    let albumList = await discoPage.evaluate(() => {
        function replaceAll(str, find, replace) {
            return str.replace(new RegExp(find, 'g'), replace);
        }
        let albums = [];
        let counter = 1;

        let albumElems = document.querySelectorAll(`li.music-grid-item > a:nth-child(1)`);


        albumElems.forEach((albele) => {
            let useTitle = document.querySelector(`li.music-grid-item:nth-child(${counter})`).innerText
            useTitle = replaceAll(useTitle, " ", "_")
            useTitle = replaceAll(useTitle, "'", "")
            useTitle = replaceAll(useTitle, "\"", "")
            useTitle = replaceAll(useTitle, "\t", "-")
            useTitle = replaceAll(useTitle, "\r", "-")
            useTitle = replaceAll(useTitle, "\n", "-")
            useTitle = replaceAll(useTitle, ",", "-")
            useTitle = replaceAll(useTitle, "&", "-")


            useTitle = replaceAll(useTitle, ":", "-")


            useTitle = useTitle.split("/").join("-")
            useTitle = useTitle.split("?").join("-")
            useTitle = useTitle.split(".").join("-")
            useTitle = useTitle.split("*").join("-")
            useTitle = useTitle.split("%").join("-")
            useTitle = useTitle.split("\\").join("-")
            console.log("ALB TITLE:", useTitle)
            let dirPrefix = "C://Users//USER//Documents//git//bcdl//downloads";
            let useDir = `${dirPrefix}//${useTitle}`
            albums.push({ dlPath: useDir, selector: `li.music-grid-item:nth-child(${counter}) > a:nth-child(1)`, title: useTitle, link: albele.href });
            counter++;
        });
        return albums;
    });

    console.log("Albums", albumList)

    /* create folder for each album */
    for (let albumy of albumList) {

        console.log("Attempting to create dir: ", albumy.dlPath)
        if (!fs.existsSync(albumy.dlPath)) {
            fs.mkdirSync(albumy.dlPath);
            console.log("Created dir: ", albumy.dlPath)
        }
    }


    /* for each album, open page and download all streams */

    for (let album of albumList) {
        /* open new page using the href selector */
        dlPage.waitFor(10000);
        dlPage.bringToFront();
        await dlPage._client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: album.dlPath });
        await dlPage.goto(album.link, { waitUntil: 'networkidle2' });

        let downloadList = []

        let streamURLs = await dlPage.evaluate(() => {
            let streams = [];
            let counter = 1;

            let streamElems = document.querySelectorAll(`tr.track_row_view > td:nth-child(1) > a:nth-child(1)`);

            console.log('sele', streamElems.toString())
            streamElems.forEach((streamElement) => {
                console.log("st ele", streamElement.selector)
                streams.push({ select: `tr.track_row_view:nth-child(${counter}) > td:nth-child(1) > a:nth-child(1)`, counter: counter });
                counter++;
            });
            return streams;
        });

        console.log("Stream URLs", streamURLs)
        console.log("Stream length", streamURLs.length)
        dlPage.on('console', msg => console.log(msg.text()));
        for (let streamSel of streamURLs) {

            let pageclick = dlPage.click(streamSel.select)
            console.log("About to grab title for", streamSel.select)

            let titleText = await dlPage.evaluate((sSel) => document.querySelector(`tr.track_row_view:nth-child(${sSel.counter}) > td:nth-child(3) > div:nth-child(1) > a:nth-child(1) > span:nth-child(1)`).innerText, streamSel);

            console.log("Found title for ", streamSel.select, "=", titleText)
                // console.log("Working on", streamSel, titleText);

            function replaceAll(str, find, replace) {
                return str.replace(new RegExp(find, 'g'), replace);
            }
            titleText = replaceAll(titleText, " ", "_")
            titleText = replaceAll(titleText, "'", "")
            titleText = replaceAll(titleText, "\"", "")
            titleText = replaceAll(titleText, "\t", "-")
            titleText = replaceAll(titleText, "\r", "-")
            titleText = replaceAll(titleText, "\n", "-")
            titleText = replaceAll(titleText, ",", "-")
            titleText = replaceAll(titleText, "&", "-")


            titleText = replaceAll(titleText, ":", "-")

            titleText = titleText.split("*").join("-")
            titleText = titleText.split("/").join("-")
            titleText = titleText.split("?").join("-")
            titleText = titleText.split(".").join("-")
            titleText = titleText.split("%").join("-")
            titleText = titleText.split("\\").join("-")
            let resp = dlPage.waitForResponse(response => {

                if (response.url().indexOf("bcbits.com/stream") > -1) {

                    respStr = response.url();
                    console.log(response.url())
                    if (!downloadList.includes(response.url())) {
                        console.log("PUSHING", titleText)
                        downloadList.push({ url: response.url(), title: titleText });
                    } else {
                        console.warn("SKIPPING download list for item", titleText)
                    }
                    return true;
                } else {
                    return false;
                }
            });
            await dlPage.waitFor(2000);
            await Promise.all([
                pageclick,
                resp
            ])
            await dlPage.waitFor(2000);
            await dlPage.click(streamSel.select)

        }
        console.log("DownloadList", downloadList)


        for (let download of downloadList) {
            if (fs.existsSync(album.dlPath)) {
                if (!fs.existsSync(`${album.dlPath}//${download.title}.mp3`)) {
                    //ensure dl path exists
                    await dlPage.waitFor(4000);
                    await dlPage.evaluate(async(respx, dlTitle, dlPath) => {
                        console.log("Fetching stream");
                        await window.fetchStream(respx, dlTitle, dlPath);
                        console.log("Stream fetched:", dlTitle);
                    }, download.url, download.title, album.dlPath);
                } else {
                    console.log("FILE EXISTS", `${album.dlPath}//${download.title}.mp3`)
                }
            } else {
                console.log("PATH NO EXIST", album.dlPath)
            }
        }
    }


})();
