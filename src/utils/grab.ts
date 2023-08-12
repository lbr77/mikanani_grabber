import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import {Client} from 'pg';
import logger from './logger';
import {processTitle,bangumiTorrent} from './parser';

const skip_list : string[]= [
"梦蓝字幕组"
,"六四位元字幕组"
];//跳过的字幕组（由于regex无法处理）
const skip_keyword = ["全集","哆啦A梦","哆啦a梦"]
const skip_regex = [/[0-9]*-[0-9]*/]
const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'lbr',
    database: 'postgres'
});
const config = {
    headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/113.0",
    }
}
const HOMEPAGE = 'https://mikanani.me/';
const RSS_URL = 'https://mikanani.me/RSS/Bangumi?bangumiId='//+bgmId
export async function parseAll(){//HomePage first.
    logger.debug("Start grabing..")
    await axios.get(HOMEPAGE,config).then(async response => {
        await client.connect();
        await client.query(`CREATE TABLE IF NOT EXISTS bangumi (
            name text,
            season text,
            episode text,
            sub text,
            dpi text,
            source text,
            subgroup text,
            dow text,
            cover text,
            bgmid text,
            torrent text
        )`);
        
        logger.debug("try to create table...")
        
        const html = response.data;
        const $ = cheerio.load(html);
        const dows = $("div.sk-bangumi");
        for(const ele of dows){
            const dow = $(ele).attr('data-dayofweek') || "10";
            const lis = $(ele).find("li");
            for(const li of lis){
                const linkEle = $(li).find("a.an-text");
                const imgEle = li.childNodes[1];
                if(linkEle.length !=0 ){
                    const attr = linkEle[0].attribs;  
                    const link = attr.href;
                    const title = attr.title;
                    const imageUrl = $(imgEle).attr('data-src')||"";
                    console.log(link);
                    await parseBangumi(link,imageUrl,title,dow);
                    logger.debug(`Finished grabbing ${title}`);
                }
            }
        }
        await sleep(3000);
        await client.query(`
        DISTINCT torrent
        `);
        await sleep(3000);
        await client.end();
    })

}
function sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
export async function parseBangumi(href : string,image :string, title: string,dow: string){
    const rssUrl = `${RSS_URL}${href.replace("/Home/Bangumi/","")}`;
    logger.debug(`grab one bangumi by rss: ${rssUrl}`);
    await axios.get(rssUrl,config)
    .then(async response => {
        logger.debug("Got rss data...parsing...");
        const rss = response.data;
        const parser = new Parser();
        await parser.parseString(rss)
        .then(async feed => {
            feed.items.forEach(async (ele)=>{
                let flag = 114514;
                for(let skips of skip_list){
                    if(ele.title?.indexOf(skips)!==-1){
                        flag = -114514;
                    }
                }
                for(let kw of skip_keyword){
                    if(ele.title?.indexOf(kw)!==-1){
                        flag = -114514;
                    }
                }
                for(let reg of skip_regex ){
                    if(reg.test(ele.title || "")){
                        flag = -114514;
                    }
                }
                if(flag === 114514){
                    const torrentAttr = processTitle(ele.title || "");
                    torrentAttr.dow = dow;
                    torrentAttr.cover = `https://mikanani.me/${image}`;
                    torrentAttr.bgmId = href.replace("/Home/Bangumi/","");
                    torrentAttr.name = title;
                    torrentAttr.torrent = ele.enclosure?.url || "";
                    await saveToDB(torrentAttr);
                }
            })
        }).catch(err=>{
            logger.error(err);
        })
    }).catch(err => {
        logger.error(err);
    })
}
async function saveToDB(attr: bangumiTorrent){
    const query = `INSERT INTO bangumi (name, season, episode, sub, dpi, source, subgroup, dow, cover, bgmid, torrent)
    VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11)
    `;
    const values = [attr.name,attr.season,attr.episode,attr.sub,attr.dpi,attr.source,attr.sub,attr.dow,attr.cover,attr.bgmId,attr.torrent];
    await client.query(query,values);
    logger.log(`Saved to db. ${attr.name}`);
}