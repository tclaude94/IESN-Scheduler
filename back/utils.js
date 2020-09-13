const credentials = require('./credentials.json');
const axios = require('axios');
const _ = require('lodash');
const fs = require('fs');
const IGInfos = require('./IESN.json')

const axiosPortailLog = axios.create({
    baseURL: 'https://portail.henallux.be/api/',
    timeout: 15000,
    headers: {
        'Authorization': 'Bearer ' + credentials.bearerPortail,
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.132 Safari/537.36'
    }
});

let currentCodes;

module.exports = {
    load: () => {
        module.exports.updateClassesCodes(true);
    },

    sendDiscordMessage: (message, isErr = true) => {
        const discordMessage = {
            content: isErr ? `<@${credentials.idDiscord}>` : "",
            avatar_url: "https://portail.henallux.be/favicon-96x96.png",
            username: "IESNScheduler",
            title: isErr ? "Error" : "Information",
            embeds: [{
                timestamp: new Date(Date.now()),
                color: isErr ? 16723200 : 51980,
                fields: [
                    {
                        name: "Message",
                        value: message
                    }
                ]
            }]
        };
        axios({
            method: 'post',
            url: credentials.webhookURL,
            data: JSON.stringify(discordMessage),
            headers: {
                'Content-Type': 'application/json'
            }
        });
    },

    updateClassesCodes: (onLoad = false) => {
        searchClassesCodes()
            .then(res => {
                let reqCodes = JSON.stringify(res);

                if (!_.isEqual(currentCodes, reqCodes)) {
                    currentCodes = reqCodes;
                    module.exports.sendDiscordMessage(onLoad ? "Codes added to cache" : "Codes updated", false);
                }
                //getCalendars();
            })
            .catch(err => {
                module.exports.sendDiscordMessage("Error when searching codes " + err);
            })
    },


    getCurrentCodes: () => {
        return JSON.parse(currentCodes);
    },

    getAxiosPortailLog: () => {
        return axiosPortailLog;
    },

    getBlocInfosForVue: (blocNb) => {
        const UEwithClasses = IGInfos['IG'][blocNb].filter(classe => classe.classes)
        const UEWithoutClasses = IGInfos['IG'][blocNb].filter(classe => !classe.classes)

        let finalArray = []
        UEWithoutClasses.map(mapToVueObject).forEach(classe => finalArray.push(classe))

        UEwithClasses.forEach(classe => {
            finalArray.push({header: classe.displayName})
            classe.classes.map(mapToVueObject).forEach(c => finalArray.push(c))
        })

        return finalArray
    },

    getBlocInfosForCalendar: () => {
        let cleanBlocs = {
            1: [],
            2: [],
            3: []
        };
        let allClassesLabels = [];
        for(let i = 1; i <= 3; i++){
            const UEwithClasses = IGInfos['IG'][i].filter(classe => classe.classes)
            const UEWithoutClasses = IGInfos['IG'][i].filter(classe => !classe.classes)
            UEWithoutClasses.map(mapToCalendar).forEach(classe => {
                cleanBlocs[i].push(classe);
                allClassesLabels.push(classe.displayName)
            })

            UEwithClasses.forEach(classe => {
                classe.classes.map(mapToCalendar).forEach(c => {
                    cleanBlocs[i].push(c);
                    allClassesLabels.push(c.displayName)
                })
            })
        }

        return {
            cleanBlocs,
            allClassesLabels
        }
    }
};

const searchClassesCodes = () => {
    return new Promise(async (resolve, reject) => {
        let updatedJson = {};
        try {
            let resBlocsID = await axiosPortailLog.get('classes/orientation_and_implantation/6/1', {
                transformResponse: [function (data) {
                    let jsonData = JSON.parse(data);
                    return jsonData.data.map(item => item.id);
                }]
            });

            for (let bloc of resBlocsID.data) {
                let resClassesID = await axiosPortailLog.get(`classes/classe_and_orientation_and_implantation/${bloc}/6/1`, {
                    transformResponse: [function (data) {
                        let jsonData = JSON.parse(data);
                        return jsonData.data.filter(grp => grp.classe);
                    }]
                });
                for (let classe of resClassesID.data) {
                    let classeID = classe.annee.charAt(0) + classe.classe;
                    updatedJson[classeID] = classe.id;
                }
            }
            resolve(updatedJson);
        } catch (e) {
            reject(e);
        }
    })
}

const mapToVueObject = (obj) => {
    return {
        text: obj.displayName,
        value: obj.id
    }
}

const mapToCalendar = (obj) => {
    return {
        displayName: obj.displayName,
        completeName: obj.completeName,
        id: obj.id
    }
}

const getCalendars = () => {
    const currentCodes = module.exports.getCurrentCodes();

    for (const classe in currentCodes) {
        const writer = fs.createWriteStream('./calendars/' + classe + '.ical');

        axios({
            method: 'get',
            url: `https://portail.henallux.be/api/plannings/promotion/[%22${currentCodes[classe]}%22]/ical`,
            responseType: 'stream',
            timeout: 15000,
            headers: {
                'Authorization': 'Bearer ' + credentials.bearerPortail,
                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/76.0.3809.132 Safari/537.36'
            }
        }).then(response => {
            return new Promise((resolve, reject) => {
                response.data.pipe(writer);
                let error = null;
                writer.on('error', err => {
                    error = err;
                    writer.close();
                    reject(err);
                });
                writer.on('close', () => {
                    if (!error) {
                        resolve(true);
                    }
                });
            });
        });
    }
}
