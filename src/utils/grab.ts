import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import {Client} from 'pg';
import logger from './logger';
import {processAnimeTitle,bangumiTorrent, processMovieTitle} from './parser';

const skip_list : string[]= [
"梦蓝字幕组"
,"六四位元字幕组"
];//跳过的字幕组（由于regex无法处理）
const skip_keyword = ["全集","哆啦A梦","哆啦a梦","柯南","海贼"]
const skip_regex = [/[0-9][0-9]-[0-9][0-9]/]
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
        await client.query(`CREATE TABLE IF NOT EXISTS bangumitorrent (
            name text,
            season text,
            episode text,
            sub text,
            dpi text,
            source text,
            subgroup text,
            dow text,
            mikanid text,
            torrent text
        )`);
        await client.query(`
        CREATE TABLE IF NOT EXISTS bangumiinfo (
            name text,
            cover text,
            mikanid text,
            dow text
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
        await sleep(10000);
        await client.end();
    })

}
function sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function dowTostring(dow:string){
    let dowI = parseInt(dow);
    if(dowI>=0 && dowI<=6){
        return "星期"+["日","一","二","三","四","五","六"][dowI]
    }
    else return ["剧场版","OVA"][dowI-7]
}
export async function parseBangumi(href : string,image :string, title: string,dow: string){
    for(let skips of skip_list){
        if(title.indexOf(skips)!==-1){
            return;
        }
    }
    for(let kw of skip_keyword){
        if(title.indexOf(kw)!==-1){
            return;
        }
    }
    for(let reg of skip_regex ){
        if(reg.test(title|| "")){
            return;
        }
    }
    await client.query(`INSERT INTO bangumiinfo (name,cover,mikanid,dow) 
    VALUES (\$1 ,\$2  ,\$3 ,\$4 ) 
    ON CONFLICT DO NOTHING`,[title,image,href.replace("/Home/Bangumi/",""),dowTostring(dow)]);
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
                for(let skips of skip_list){
                    if(ele.title?.indexOf(skips)!==-1){
                        return;
                    }
                }
                for(let kw of skip_keyword){
                    if(ele.title?.indexOf(kw)!==-1){
                        // flag = -114514;
                        return;
                    }
                }
                for(let reg of skip_regex ){
                    if(reg.test(ele.title || "")){
                        return;
                    }
                }
                let torrentAttr: bangumiTorrent = {
                    name   : "998454323",
                    season : "",
                    episode: "",
                    sub    : "",//字幕类型(简繁E)
                    dpi    : "",//清晰度
                    source : "",//bilibili AT-X...
                    group  : "",//字幕组
                    torrent: "",//torrentUrl;
                    dow    : "",//星期几
                    cover  : "",//封面
                    bgmId  : "",//mikanani.id
                };
                if(dow in ["0","1","2","3","4","5","6"]){//Anime
                    torrentAttr = processAnimeTitle(ele.title || "");
                }
                else if(dow in ["7","8"]){//剧场版//OVA解析
                    torrentAttr = processMovieTitle(ele.title || "");
                }
                if(torrentAttr.name === "998454323"){
                    return;
                }
                torrentAttr.dow = dowTostring(dow);
                torrentAttr.cover = `https://mikanani.me${image}`;
                torrentAttr.bgmId = href.replace("/Home/Bangumi/","");
                torrentAttr.name = title;
                let dealTorrent = (url:string) => {
                    return url.replace("https://mikanani.me/Download/","").replace(".torrent","");
                }
                torrentAttr.torrent = dealTorrent(ele.enclosure?.url || "https://mikanani.me/Download/.torrent");
                await saveToBangumiDB(torrentAttr);
            })
        }).catch(err=>{
            logger.error(err);
        })
    }).catch(err => {
        logger.error(err);
    })
}
async function saveToBangumiDB(attr: bangumiTorrent){
    /*     INSERT INTO bangumi (name, season, episode, sub, dpi, source, subgroup, dow, cover, bgmid, torrent)
    VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10, \$11)
    ON CONFLICT (torrent) DO NOTHING */
    const query = `INSERT INTO bangumitorrent (name, season, episode, sub, dpi, source, subgroup, dow, mikanid, torrent)
    VALUES (\$1, \$2, \$3, \$4, \$5, \$6, \$7, \$8, \$9, \$10)
    ON CONFLICT (torrent) DO NOTHING
    `;
    const values = [attr.name,attr.season,attr.episode,attr.sub,attr.dpi,attr.source,attr.group,attr.dow,attr.bgmId,attr.torrent];
    await client.query(query,values);
    logger.log(`Saved to db. [${attr.group}] ${attr.name} ${attr.episode}`);
}