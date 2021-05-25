on('ready', () => {
    sendChat('test', 'started');
    log('started');
});

const Characteristics = [
    'weapon_skill',
    'ballistic_skill',
    'strength',
    'toughness',
    'agility',
    'intelligence',
    'perception',
    'willpower',
    'fellowship',
    'influence',
];

//on('change:attribute', (ev) => {
//    const charId = ev.get('_characterid');
//    const eventName = ev.get('name');
//    const eventValue = ev.get('current');
//    //log(`Change ${eventName} ${eventValue}`);
//});
//
//on('add:attribute', (ev) => {
//    const charId = ev.get('_characterid');
//    const eventName = ev.get('name');
//    const eventValue = ev.get('current');
//    //log(`Add ${eventName} ${eventValue}`);
//});

function sanitizeToNumber(input) {
    let num = 0;
    if (typeof input !== 'number' && typeof input !== 'string') {
        return num;
    }
    if (typeof input === 'string') {
        num = parseInt(input, 10);
    } else {
        num = input;
    }
    if (num === NaN) {
        return 0;
    }
    return num;
}

function sanitizeToFloat(input) {
    let num = 0;
    if (typeof input !== 'number' && typeof input !== 'string') {
        return num;
    }
    if (typeof input === 'string') {
        num = parseFloat(input);
    } else {
        num = input;
    }
    if (num === NaN) {
        return 0;
    }
    return num;
}

function processInlinerolls(msg) {
    let content = msg.content;
    if (msg.inlinerolls && content) {
        const regex = /(\$\[\[[0-9]+\]\])/ig;
        const groups = content.match(regex);
        for (let a = 0; a < groups.length; a++) {
            const value = msg.inlinerolls[a].results.total;
            content = content.replace(groups[a], value);
        }
        return content;
    } else {
        return content;
    }
};

const savedRolls = {};
function calcWeaponHit(who, playerId, paramArray, fate) {
    const charId = paramArray[0];
    const prefix = paramArray[1];
    let weaponType = 'melee_weapon';
    if (prefix.indexOf('rangedweapons') !== -1) {
        weaponType = 'ranged_weapon';
    }
    const weaponId = paramArray[2];
    const skill = sanitizeToNumber(paramArray[3]);
    const aimMod = sanitizeToNumber(paramArray[4]);
    const rangeMod = sanitizeToNumber(paramArray[5]);
    const meleeAttackType = sanitizeToNumber(paramArray[5]);
    let rofMod = sanitizeToNumber(paramArray[6]);
    let supressingFireMode = 'none';
    if (rofMod === -21) {
        supressingFireMode = 'semi';
        rofMod = -20;
    } else if (rofMod === -22) {
        supressingFireMode = 'auto';
        rofMod = -20;
    }
    const firingModeMod = sanitizeToNumber(paramArray[7]);
    const modifier = sanitizeToNumber(paramArray[8]);
    let roll = sanitizeToNumber(paramArray[9]);
    if (fate) {
        roll = Math.floor(Math.random() * 100) + 1; 
    }
    const specials = [];
    const mods = [];
    const result = [];
    let jam = {
        jammed: false,
        status: ''
    };

    result.push(getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_name`));
    if (weaponType === 'ranged_weapon') {
        result.push('Ballistic skill');
    } else {
        result.push('Weapon skill');
    }
    result.push(skill);
    result.push('Aim');
    result.push(aimMod);
    if (weaponType === 'ranged_weapon') {
        result.push('Range');
        result.push(rangeMod);
        result.push('RoF');
        result.push(rofMod);
    }
    if (weaponType === 'melee_weapon') {
        result.push('Attack type');
        result.push(meleeAttackType);
    }
    result.push('Roll');
    result.push(roll);
    for (let a = 1; a < 4; a++) {
        specials.push({
            'val': getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_special${a}`),
            'x': sanitizeToNumber(getAttrByName(paramArray[0], `${prefix}_${weaponId}_${weaponType}_special${a}_x`))
        });
    }
    for (let a = 1; a < 5; a++) {
        mods.push({
            'val': getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_mod${a}`)
        });
    }
    for (let a = 0; a < specials.length; a++) {
        switch(specials[a].val) {
            case 'accurate':
                if (aimMod > 0) {
                    result.push('Accurate');
                    result.push(10);
                }
            break;
            case 'defensive':
                result.push('Defensive');
                result.push(-10);
            break;
            case 'inaccurate':
                result[4] = 0;
            break;
            case 'scatter':
                if (rangeMod === 30 || rangeMod === 10) {
                    result.push('Scatter');
                    result.push(10);
                }
            break;
            case 'unreliable':
                jam.status = 'unreliable';
                if (roll >= 91) {
                    jam.jammed = true;
                }
            break;
            case 'reliable':
                jam.status = 'reliable';
                if (roll >= 100) {
                    jam.jammed = true;
                }
            break;
        }
    }
    for (let a = 0; a < mods.length; a++) {
        if (result.includes(mods[a].val)) {
            continue;
        }
        switch(mods[a].val) {
            case 'custom_grip':
                result.push('Custom grip');
                result.push(5);
            break;
            case 'fluid_action':
                if (rofMod === 0) {
                    result.push('Fluid action');
                    result.push(10);
                }
            break;
            case 'modified_stock':
                if (aimMod === 10) {
                    result.push('Modified stock');
                    result.push(2);
                }
                if (aimMod === 20) {
                    result.push('Modified stock');
                    result.push(4);
                }
            break;
            case 'motion_predictor':
                if (rofMod === 0 || rofMod === -10) {
                    result.push('Motion predictor');
                    result.push(10);
                }
            break;
            case 'red_dot_laser_sight':
                if (rofMod === 10) {
                    result.push('Red dot');
                    result.push(10);
                }
            break;
            case 'omni_scope':
                if (rofMod === 10) {
                    result.push('Omni scope');
                    result.push(10);
                }
                if (aimMod === 20) {
                    result[6] = 0;
                }
            break;
            case 'telescopic_sight':
                if (aimMod === 20) {
                    result[6] = 0;
                }
            break;
        }
    }
    if (modifier !== 0) {
        result.push('Modifier');
        result.push(modifier);
    }

    let bulletsUsed = 0;
    let ammoBefore = 0;
    if (weaponType === 'ranged_weapon') {
        const semiAuto = sanitizeToNumber(getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_semi`));
        const fullAuto = sanitizeToNumber(getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_full`));
        const currentAmmo = findObjs({
            type: 'attribute',
            characterid: charId,
            name: `${prefix}_${weaponId}_${weaponType}_clip`
        }, {caseInsensitive: true})[0];
        let ammo = sanitizeToNumber(currentAmmo.get('current'));
        if (fate && savedRolls[playerId] && savedRolls[playerId].ammo) {
            ammo = savedRolls[playerId].ammo
        }
        bulletsUsed = 0;
        ammoBefore = ammo;
        if (rofMod === 10 || (rofMod === -20 && supressingFireMode === 'none')) {
            if (jam.status === '' && roll >= 96) {
                jam.jammed = true; 
            }
            bulletsUsed = 1 * firingModeMod;
        } else if (rofMod === 0) {
            if (jam.status === '' && roll >= 94) {
                jam.jammed = true; 
            }
            bulletsUsed = semiAuto * firingModeMod;
        } else if (rofMod === -10) {
            if (jam.status === '' && roll >= 94) {
                jam.jammed = true; 
            }
            bulletsUsed = fullAuto * firingModeMod;
        } else if (supressingFireMode === 'semi') {
            if (jam.status === '' && roll >= 94) {
                jam.jammed = true; 
            }
            bulletsUsed = semiAuto * firingModeMod;
        } else if (supressingFireMode === 'auto') {
            if (jam.status === '' && roll >= 94) {
                jam.jammed = true; 
            }
            bulletsUsed = fullAuto * firingModeMod;
        } else {
            if (jam.status === '' && roll >= 96) {
                jam.jammed = true; 
            }
            bulletsUsed = 1 * firingModeMod;
        }
        if (jam.jammed) {
            bulletsUsed = ammo;
            ammo = 0;
        }
        ammo -= bulletsUsed;
        if (ammo < 0) {
            ammo = 0;
        }
        currentAmmo.set('current', ammo);
    }
    savedRolls[playerId] = {
        ammo: ammoBefore,
        paramArray: paramArray,
        type: 'hit'
    };
    savedRolls[weaponId] = {
        aim: aimMod,
    }
    postWeaponHitInfo(who, charId, prefix, weaponId, weaponType, bulletsUsed, ammoBefore, jam.jammed, playerId);
    postRollTemplateResult(who, result, weaponId);
    postHitLocationInfo(who, roll);
}

function postHitLocationInfo(who, roll) {
    let hitLocation = 1;
    if (roll < 100) {
        const tenth = Math.floor(roll / 10);
        const single = roll - tenth * 10;
        hitLocation = single * 10 + tenth;
    }
    let hitPart = '';
    if (hitLocation <= 10) {
        hitPart = 'Head';
    } else if (hitLocation <= 20) {
        hitPart = 'Right Arm';
    } else if (hitLocation <= 30) {
        hitPart = 'Left Arm';
    } else if (hitLocation <= 70) {
        hitPart = 'Body';
    } else if (hitLocation <= 85) {
        hitPart = 'Right Arm';
    } else {
        hitPart = 'Left Arm';
    }
    sendChat(who, `Location ${hitLocation} hits ${hitPart}`);
}

function postWeaponHitInfo(who, charId, prefix, weaponId, weaponType, bulletsUsed, ammoBefore, jammed, playerId) {
    const weaponName = getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_name`);
    const playerName = getAttrByName(charId, `player_name`);
    if (playerIsGM(playerId) && playerName.indexOf('npc') === -1) {
        return;
    }
    if (weaponType === 'ranged_weapon') {
        const remainingAmmo = ammoBefore - bulletsUsed;
        sendChat(who, `<br/><div style="padding:5px;font-style:italic;text-align: center;font-weight: bold;background-color:#F5E4D3;color:#653E10">${who} whispers "Emperor Guide my Bullet"<div>`);
        sendChat(who, `${who} uses his ${weaponName} and expends ${bulletsUsed} ammo, ${remainingAmmo} ammo left.`);
        if (remainingAmmo < 0) {
            sendChat(who, `<div style="color:red;">${weaponName} used more ammo then it had.</div>`);
        }
        if (jammed) {
            sendChat(who, `<div style="color:red;">${weaponName} has jammed.</div>`);
        }
    } else {
        sendChat(who, `<br/><div style="padding:5px;font-style:italic;text-align: center;font-weight: bold;background-color:#F5E4D3;color:#653E10">${who} exclaims "Be cut apart by the Emperors wrath"<div>`);
    }
}

function postRollTemplateResult(who, paramArray, weaponId) {
    const paramMap = {};
    let roll = -1;
    const name = paramArray[0];
    for (let a = 1; a < paramArray.length; a+=2) {
        if (paramArray[a] === 'Roll') {
            roll = sanitizeToNumber(paramArray[a + 1]);
        } else {
            paramMap[paramArray[a]] = sanitizeToNumber(paramArray[a + 1]);
        }
    }
    const keys = Object.keys(paramMap);
    let target = 0;
    let output = `&{template:dh2e2021roll} {{Name=${name}}}`;
    for (let a = 0; a < keys.length; a++) {
        output += ` {{${keys[a]}=${paramMap[keys[a]]}}}`;
        target += paramMap[keys[a]];
    }
    output += ` {{Target=${target}}}`;
    output += ` {{Roll=${roll}}}`;
    let degOfSuc = 0;
    if (roll <= target) {
        degOfSuc = (Math.floor(target / 10) - Math.floor(roll / 10)) + 1;
        output += ` {{Degreesp=+${degOfSuc}}}`;
    } else {
        degOfSuc = (Math.floor(roll / 10) - Math.floor(target / 10)) + 1;
        output += ` {{Degreesm=-${degOfSuc}}}`;
        degOfSuc = -degOfSuc;
    }
    if (weaponId && savedRolls[weaponId] === undefined) {
        savedRolls[weaponId] = {};
    }
    if (weaponId) {
        savedRolls[weaponId].degOfSuc = degOfSuc;
    }
    sendChat(who, output);
}

function useFatePoint(charId, who) {
    const fatePoints = findObjs({
        type: 'attribute',
        characterid: charId,
        name: `fate`
    }, {caseInsensitive: true})[0];
    let currentFatePoints = fatePoints.get('current');
    if (currentFatePoints <= 0) {
        return false;
    } else {
        currentFatePoints--;
        fatePoints.set('current', currentFatePoints);
        sendChat(who, `<br/><div style="padding:5px;font-style:italic;text-align: center;font-weight: bold;background-color:#F5E4D3;color:#653E10">The emperor protects<div>`);
        sendChat(who, `<div">${who} uses a fate point, he has ${currentFatePoints} fate points left.</div>`);
    }
    return true;
}

function calcWeaponDmg(who, playerId, paramArray, msg, fate) {
    const charId = paramArray[0];
    const prefix = paramArray[1];
    let weaponType = 'melee_weapon';
    if (prefix.indexOf('rangedweapons') !== -1) {
        weaponType = 'ranged_weapon';
    } else if (prefix.indexOf('repeating_psypowers') !== -1) {
        weaponType = 'psy_power';
    }
    const weaponId = paramArray[2];
    let damage = sanitizeToNumber(paramArray[3]);
    const penetration = sanitizeToNumber(paramArray[4]);
    const type = paramArray[5];
    const name = paramArray[6];
    const specials = [];
    let aimMod = 0;
    let degOfSuc = 0;
    if (weaponId && savedRolls[weaponId]) {
        aimMod = savedRolls[weaponId].aim;
        degOfSuc = savedRolls[weaponId].degOfSuc;
    }
    if (weaponType === 'melee_weapon' || weaponType === 'ranged_weapon' ) {
        for (let a = 1; a < 4; a++) {
            specials.push({
                'val': getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_special${a}`),
                'x': sanitizeToNumber(getAttrByName(paramArray[0], `${prefix}_${weaponId}_${weaponType}_special${a}_x`))
            });
        }
    }
    let border = '';
    let min = false;
    let max = false;
    for (let a = 0; a < msg.inlinerolls.length; a++) {
        const inlineroll = msg.inlinerolls[a];
        for (let c = 0; c < inlineroll.results.rolls.length; c++) {
            const roll = inlineroll.results.rolls[c];
            if (roll.type === 'R') {
                for (let b = 0; b < roll.results.length; b++) {
                    if (roll.results[b].v === roll.sides) {
                        max = true;
                    }
                    if (roll.results[b].v === 1) {
                        min = true;
                    }
                }
            }
        }
    }
    if (min) {
        border = 'rolltemplate-container-damage-value-min';
    }
    if (max) {
        border = 'rolltemplate-container-damage-value-max';
    }
    if (weaponType === 'melee_weapon' || weaponType === 'ranged_weapon' ) {
        let tearing = false;
        let accurate = false;
        for (let a = 0; a < specials.length; a++) {
            if (specials[a].val === 'tearing') {
                tearing = true;
            }
            if (specials[a].val === 'accurate') {
                accurate = true;
            }
        }
        if (accurate) {
            let num = Math.floor((degOfSuc - 1) / 2);
            if (num > 2) {
                num = 2;
            }
            if (num === 1) {
                damage += Math.floor(Math.random() * 10) + 1;
            } else if (num === 2) {
                damage += Math.floor(Math.random() * 10) + 1; 
                damage += Math.floor(Math.random() * 10) + 1; 
            }
        }
    }
    let output = `&{template:dh2e2021damage} {{Name=${name}}}`;
    output += ` {{Who=${who}}}`;
    output += ` {{WeaponName=${name}}}`;
    output += ` {{Damage=${damage}}}`;
    output += ` {{Penetration=${penetration}}}`;
    output += ` {{Type=${type}}}`;
    output += ` {{Border=${border}}}`;
    sendChat(who, output);
}

function calcFocusPower(who, playerId, paramArray, fate) {
    const charId = paramArray[0];
    const focusName = paramArray[1];
    const characteristic = sanitizeToNumber(paramArray[2]);
    const psyRating = sanitizeToNumber(paramArray[3]);
    const psyUse = sanitizeToNumber(paramArray[4]);
    const psyniscienceSkill = sanitizeToNumber(paramArray[5]) - 20;
    const modifier = sanitizeToNumber(paramArray[6]);
    let roll = sanitizeToNumber(paramArray[7]);
    if (fate) {
        roll = Math.floor(Math.random() * 100) + 1; 
    }
    const result = [];
    result.push('F.P. ' + focusName);
    result.push(focusName);
    result.push(characteristic);
    result.push('Psy rating');
    result.push(psyRating * 10);
    result.push('Psy use');
    result.push(-psyUse * 10);
    if (focusName === 'Psyniscience') {
        result.push('psynicience Skill');
        result.push(psyniscienceSkill);
    }
    if (modifier !== 0) {
        result.push('Modifier');
        result.push(modifier);
    }
    result.push('Roll');
    result.push(roll);
    postRollTemplateResult(who, result);
    if (roll % 11 === 0 || roll === 100) {
        sendChat(who, `Something stirs in the warp... <br/>Roll for Psychic Phenomena`);
    }
}

function calcPsyHit(who, playerId, paramArray, fate) {
    const charId = paramArray[0];
    const prefix = paramArray[1];
    const psyPowerId = paramArray[2];
    const psyName = paramArray[3];
    const psyPowerFocus = paramArray[4];
    const willpower = sanitizeToNumber(paramArray[5]);
    const perception = sanitizeToNumber(paramArray[6]);
    const psyniscience = sanitizeToNumber(paramArray[7]);
    const psyRating = sanitizeToNumber(paramArray[8]);
    const psyUse = sanitizeToNumber(paramArray[9]);
    const modifier = sanitizeToNumber(paramArray[10]);
    const psynicienceSkill = sanitizeToNumber(paramArray[11]) - 20;
    const powerModifier = sanitizeToNumber(paramArray[12]);
    let roll = sanitizeToNumber(paramArray[13]);
    if (fate) {
        roll = Math.floor(Math.random() * 100) + 1; 
    }

    const result = [];
    result.push(psyName);
    if (psyPowerFocus === 'willpower') {
        result.push('Willpower');
        result.push(willpower);
    } else if (psyPowerFocus === 'perception') {
        result.push('Perception');
        result.push(perception);
    } else if (psyPowerFocus === 'psyniscience') {
        result.push('Psyniscience');
        result.push(psyniscience);
        result.push('Psynicience Skill');
        result.push(psynicienceSkill);
    }
    result.push('Psy rating');
    result.push(psyRating * 10);
    result.push('Psy use');
    result.push(-psyUse * 10);
    result.push('Power modifier');
    result.push(powerModifier);
    if (modifier !== 0) {
        result.push('Modifier');
        result.push(modifier);
    }
    result.push('Roll');
    result.push(roll);
    postRollTemplateResult(who, result);
    postHitLocationInfo(who, roll);
    if (roll % 11 === 0 || roll === 100) {
        sendChat(who, `Something stirs in the warp... <br/>Roll for Psychic Phenomena`);
    }
}

on('chat:message', function (msg) {
    const rollCmd = '!dh2e2021roll ';
    const weaponHitCmd = '!dh2e2021weaponhit ';
    const weaponDamageCmd = '!dh2e2021damage ';
    const fateWeaponHitCmd = '!dh2e2021fateweaponhit ';
    const focusPowerCmd = '!dh2e2021focuspower ';
    const psyHitCmd = '!dh2e2021psyhit ';
    const playerId = msg.playerid;

    if (msg.type === 'api' && msg.content.indexOf(rollCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(rollCmd.length).split(',');
        postRollTemplateResult(msg.who, paramArray);
    }

    if (msg.type === 'api' && msg.content.indexOf(weaponHitCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(weaponHitCmd.length).split(',');
        calcWeaponHit(msg.who, playerId, paramArray, false);
    }

    if (msg.type === 'api' && msg.content.indexOf(weaponDamageCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(weaponDamageCmd.length).split(',');
        savedRolls[playerId] = {
            msg: msg,
            type: 'damage'
        };
        calcWeaponDmg(msg.who, playerId, paramArray, msg, false);
    }

    if (msg.type === 'api' && msg.content.indexOf(focusPowerCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(focusPowerCmd.length).split(',');
        savedRolls[playerId] = {
            msg: msg,
            type: 'focuspower'
        };
        calcFocusPower(msg.who, playerId, paramArray, false);
    }

    if (msg.type === 'api' && msg.content.indexOf(psyHitCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(psyHitCmd.length).split(',');
        savedRolls[playerId] = {
            msg: msg,
            type: 'psyhit'
        };
        calcPsyHit(msg.who, playerId, paramArray, false);
    }

    if (msg.type === 'api' && msg.content.indexOf(fateWeaponHitCmd) !== -1) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(fateWeaponHitCmd.length).split(',');
        if (savedRolls[playerId] && savedRolls[playerId].type === 'hit' && useFatePoint(paramArray[0], msg.who)) {
            const savedParamArray = savedRolls[playerId].paramArray;
            calcWeaponHit(msg.who, playerId, savedParamArray, true);
        }
        if (savedRolls[playerId] && savedRolls[playerId].type === 'damage' && useFatePoint(paramArray[0], msg.who)) {
            const msg2 = savedRolls[playerId].msg;
            const content2 = processInlinerolls(msg2);
            const paramArray2 = content2.slice(weaponDamageCmd.length).split(',');
            calcWeaponDmg(msg.who, playerId, paramArray2, msg2, true);
        }
        if (savedRolls[playerId] && savedRolls[playerId].type === 'focuspower' && useFatePoint(paramArray[0], msg.who)) {
            const msg2 = savedRolls[playerId].msg;
            const content2 = processInlinerolls(msg2);
            const paramArray2 = content2.slice(focusPowerCmd.length).split(',');
            calcFocusPower(msg.who, playerId, paramArray2, true);
        }
        if (savedRolls[playerId] && savedRolls[playerId].type === 'psyhit' && useFatePoint(paramArray[0], msg.who)) {
            const msg2 = savedRolls[playerId].msg;
            const content2 = processInlinerolls(msg2);
            const paramArray2 = content2.slice(psyHitCmd.length).split(',');
            calcPsyHit(msg.who, playerId, paramArray2, true);
        }
    }
});

function calcAdvancementsExp(charId, eventName, originalEvent) {
    if (eventName.indexOf('repeating_autoadvancements') === -1) {
        return;
    }
    const allAtributes = findObjs({
        type: 'attribute',
        characterid: charId,
    }, {caseInsensitive: true});
    const autoAdvancementsIds = [];
    const regexAutoAdvancements = /repeating_autoadvancements_(.+?)_auto_advancement_(1|2|3)/;
    const regexAptitude1Ids = /repeating_aptitude1_(.+?)_aptitudes/;
    const regexAptitude2Ids = /repeating_aptitude2_(.+?)_aptitudes/;
    const regexAptitudeEliteIds = /repeating_eliteadvances_(.+?)_elite_advance_aptitude/;
    const aptitudes = {};
    for (let a = 0; a < allAtributes.length; a++) {
        const name = allAtributes[a].get('name');
        let groups = name.match(regexAptitude1Ids);
        if (groups && groups.length === 2) {
            aptitudes[allAtributes[a].get('current')] = true;
        }
        groups = name.match(regexAptitude2Ids);
        if (groups && groups.length === 2) {
            aptitudes[allAtributes[a].get('current')] = true;
        }
        groups = name.match(regexAptitudeEliteIds);
        if (groups && groups.length === 2) {
            aptitudes[allAtributes[a].get('current')] = true;
        }
    }
    log(aptitudes);
    for (let a = 0; a < allAtributes.length; a++) {
        const name = allAtributes[a].get('name');
        const current = allAtributes[a].get('current');
        let groups = name.match(regexAutoAdvancements);
        if (groups && groups.length === 3 && !name.endsWith('exp')) {
            const adv = advancements[current];
            if (adv) {
                let match = 0;
                if (aptitudes[adv.a1]) {
                    match++;
                }
                if (aptitudes[adv.a2]) {
                    match++;
                }
                log(adv.name + ' ' + match);
                let cost = advancementsCosts[adv.tier][match];
                const expCost = findObjs({
                    type: 'attribute',
                    characterid: charId,
                    name: name + 'exp'
                }, {caseInsensitive: true});
                if (expCost && expCost[0]) {
                    expCost[0].set('current', cost);
                }
            }
        }
    }
}

const advancementsCosts = {
    1: {
        0: 200,
        1: 300,
        2: 400
    },
    2: {
        0: 300,
        1: 450,
        2: 600
    },
    3: {
        0: 600,
        1: 900,
        2: 1200
    }
}

const advancements = {
    'Ambidextrous':{name:'Ambidextrous',
        a1:'weapon skill',
        a2:'ballistic skill',
        tier:1
    },
    'Blind Fighting':{name:'Blind Fighting',
        a1:'perception',
        a2:'fieldcraft',
        tier:1
    },
    'Bodyguard':{name:'Bodyguard',
        a1:'agility',
        a2:'defence',
        tier:1
    },
    'Catfall':{name:'Catfall',
        a1:'agility',
        a2:'fieldcraft',
        tier:1
    },
    'Clues from the Crowds':{name:'Clues from the Crowds',
        a1:'general',
        a2:'social',
        tier:1
    },
    'Die Hard':{name:'Die Hard',
        a1:'willpower',
        a2:'defence',
        tier:1
    },
    'Disarm':{name:'Disarm',
        a1:'weapon skill',
        a2:'defence',
        tier:1
    },
    'Double Team':{name:'Double Team',
        a1:'general',
        a2:'offence',
        tier:1
    },
    'Enemy (choose)':{name:'Enemy (choose)',
        a1:'general',
        a2:'social',
        tier:1
    },
    'Ferric Summons':{name:'Ferric Summons',
        a1:'willpower',
        a2:'tech',
        tier:1
    },
    'Flagellant':{name:'Flagellant',
        a1:'offense',
        a2:'toughness',
        tier:1
    },
    'Frenzy':{name:'Frenzy',
        a1:'strength',
        a2:'offence',
        tier:1
    },
    'Grenadier':{name:'Grenadier',
        a1:'ballistic skill',
        a2:'finesse',
        tier:1
    },
    'Iron Jaw':{name:'Iron Jaw',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Jaded':{name:'Jaded',
        a1:'willpower',
        a2:'defence',
        tier:1
    },
    'Keen Intuition':{name:'Keen Intuition',
        a1:'perception',
        a2:'social',
        tier:1
    },
    'Leap Up':{name:'Leap Up',
        a1:'agility',
        a2:'general',
        tier:1
    },
    'Leaping Dodge':{name:'Leaping Dodge',
        a1:'agility',
        a2:'defence',
        tier:1
    },
    'Mounted Warrior':{name:'Mounted Warrior',
        a1:'ballistic skill',
        a2:'offence',
        tier:1
    },
    'Mounted Warrior':{name:'Mounted Warrior',
        a1:'weapon skill',
        a2:'offence',
        tier:1
    },
    'Nowhere to Hide':{name:'Nowhere to Hide',
        a1:'perception',
        a2:'offence',
        tier:1
    },
    'Peer (choose)':{name:'Peer (choose)',
        a1:'fellowship',
        a2:'social',
        tier:1
    },
    'Quick Draw':{name:'Quick Draw',
        a1:'agility',
        a2:'finesse',
        tier:1
    },
    'Rapid Reload':{name:'Rapid Reload',
        a1:'agility',
        a2:'fieldcraft',
        tier:1
    },
    'Resistance (Cold)':{name:'Resistance (Cold)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Fear)':{name:'Resistance (Fear)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Heat)':{name:'Resistance (Heat)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Poisons)':{name:'Resistance (Poisons)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Psychic Powers)':{name:'Resistance (Psychic Powers)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Radiation)':{name:'Resistance (Radiation)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Vacuum)':{name:'Resistance (Vacuum)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Resistance (Other)':{name:'Resistance (Other)',
        a1:'toughness',
        a2:'defence',
        tier:1
    },
    'Skilled Rider':{name:'Skilled Rider',
        a1:'agility',
        a2:'fieldcraft',
        tier:1
    },
    'Sound Constitution':{name:'Sound Constitution',
        a1:'toughness',
        a2:'general',
        tier:1
    },
    'Takedown':{name:'Takedown',
        a1:'weapon skill',
        a2:'offence',
        tier:1
    },
    'Technical Knock':{name:'Technical Knock',
        a1:'intelligence',
        a2:'tech',
        tier:1
    },
    'Warp Sense':{name:'Warp Sense',
        a1:'perception',
        a2:'psyker',
        tier:1
    },
    'Weapon Training (Bolt)':{name:'Weapon Training (Bolt)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Chain)':{name:'Weapon Training (Chain)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Flame)':{name:'Weapon Training (Flame)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Heavy)':{name:'Weapon Training (Heavy)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Las)':{name:'Weapon Training (Las)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Launcher)':{name:'Weapon Training (Launcher)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Low-Tech)':{name:'Weapon Training (Low-Tech)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Melta)':{name:'Weapon Training (Melta)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Plasma)':{name:'Weapon Training (Plasma)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Power)':{name:'Weapon Training (Power)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Shock)':{name:'Weapon Training (Shock)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon Training (Solid Projectile)':{name:'Weapon Training (Solid Projectile)',
        a1:'general',
        a2:'finesse',
        tier:1
    },
    'Weapon-Tech':{name:'Weapon-Tech',
        a1:'intelligence',
        a2:'tech',
        tier:1
    },
    'Ambassador Imperialis':{name:'Ambassador Imperialis',
        a1:'perception',
        a2:'social',
        tier:2
    },
    'Archivator':{name:'Archivator',
        a1:'knowledge',
        a2:'social',
        tier:2
    },
    'Armor-Monger':{name:'Armor-Monger',
        a1:'intelligence',
        a2:'tech',
        tier:2
    },
    'Battle Rage':{name:'Battle Rage',
        a1:'strength',
        a2:'defence',
        tier:2
    },
    'Bulging Biceps':{name:'Bulging Biceps',
        a1:'strength',
        a2:'offence',
        tier:2
    },
    'Bulwark of Faith':{name:'Bulwark of Faith',
        a1:'defence',
        a2:'willpower',
        tier:2
    },
    'Combat Master':{name:'Combat Master',
        a1:'weapon skill',
        a2:'defence',
        tier:2
    },
    'Constant Vigilance':{name:'Constant Vigilance',
        a1:'perception',
        a2:'defence',
        tier:2
    },
    'Constant Vigilance':{name:'Constant Vigilance',
        a1:'intelligence',
        a2:'defence',
        tier:2
    },
    'Contact Network':{name:'Contact Network',
        a1:'fellowship',
        a2:'leadership',
        tier:2
    },
    'Coordinated Interrogation':{name:'Coordinated Interrogation',
        a1:'intelligence',
        a2:'social',
        tier:2
    },
    'Counter Attack':{name:'Counter Attack',
        a1:'weapon skill',
        a2:'defence',
        tier:2
    },
    'Cover-Up':{name:'Cover-Up',
        a1:'intelligence',
        a2:'knowledge',
        tier:2
    },
    'Daemonhunter':{name:'Daemonhunter',
        a1:'offence',
        a2:'willpower',
        tier:2
    },
    'Daemonologist':{name:'Daemonologist',
        a1:'psyker',
        a2:'willpower',
        tier:2
    },
    'Deny the Witch':{name:'Deny the Witch',
        a1:'willpower',
        a2:'defence',
        tier:2
    },
    'Devastating Assault':{name:'Devastating Assault',
        a1:'weapon skill',
        a2:'offence',
        tier:2
    },
    'Double Tap':{name:'Double Tap',
        a1:'finesse',
        a2:'offence',
        tier:2
    },
    'Exotic Weapon Training':{name:'Exotic Weapon Training',
        a1:'intelligence',
        a2:'finesse',
        tier:2
    },
    'Face in a Crowd':{name:'Face in a Crowd',
        a1:'fellowship',
        a2:'social',
        tier:2
    },
    'Field Vivisection':{name:'Field Vivisection',
        a1:'ballistic skill',
        a2:'knowledge',
        tier:2
    },
    'Field Vivisection':{name:'Field Vivisection',
        a1:'weapon skill',
        a2:'knowledge',
        tier:2
    },
    'Hard Target':{name:'Hard Target',
        a1:'agility',
        a2:'defence',
        tier:2
    },
    'Harden Soul':{name:'Harden Soul',
        a1:'defence',
        a2:'willpower',
        tier:2
    },
    'Hardy':{name:'Hardy',
        a1:'toughness',
        a2:'defence',
        tier:2
    },
    'Hatred (choose)':{name:'Hatred (choose)',
        a1:'weapon skill',
        a2:'social',
        tier:2
    },
    'Hip Shooting':{name:'Hip Shooting',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Hotshot Pilot':{name:'Hotshot Pilot',
        a1:'agility',
        a2:'tech',
        tier:2
    },
    'Independent Targeting':{name:'Independent Targeting',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Inescapable Attack':{name:'Inescapable Attack',
        a1:'weapon skill',
        a2:'finesse',
        tier:2
    },
    'Inescapable Attack':{name:'Inescapable Attack',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Inspiring Aura':{name:'Inspiring Aura',
        a1:'leadership',
        a2:'willpower',
        tier:2
    },
    'Iron Resolve':{name:'Iron Resolve',
        a1:'defence',
        a2:'willpower',
        tier:2
    },
    'Killing Strike':{name:'Killing Strike',
        a1:'weapon skill',
        a2:'offence',
        tier:2
    },
    'Lexographer':{name:'Lexographer',
        a1:'intelligence',
        a2:'knowledge',
        tier:2
    },
    'Luminen Shock':{name:'Luminen Shock',
        a1:'weapon skill',
        a2:'tech',
        tier:2
    },
    'Maglev Transcendence':{name:'Maglev Transcendence',
        a1:'intelligence',
        a2:'tech',
        tier:2
    },
    'Marksman':{name:'Marksman',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Mechadendrite Use (choose)':{name:'Mechadendrite Use (choose)',
        a1:'intelligence',
        a2:'tech',
        tier:2
    },
    'One-on-One':{name:'One-on-One',
        a1:'finesse',
        a2:'weapon skill',
        tier:2
    },
    'Penitent Psyker':{name:'Penitent Psyker',
        a1:'psyker',
        a2:'defence',
        tier:2
    },
    'Precision Killer':{name:'Precision Killer',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Precision Killer':{name:'Precision Killer',
        a1:'weapon skill',
        a2:'finesse',
        tier:2
    },
    'Prosanguine':{name:'Prosanguine',
        a1:'toughness',
        a2:'tech',
        tier:2
    },
    'Purity of Hatred':{name:'Purity of Hatred',
        a1:'offence',
        a2:'willpower',
        tier:2
    },
    'Rites of Banishment':{name:'Rites of Banishment',
        a1:'offence',
        a2:'willpower',
        tier:2
    },
    'Strong Minded':{name:'Strong Minded',
        a1:'willpower',
        a2:'defence',
        tier:2
    },
    'Swift Attack':{name:'Swift Attack',
        a1:'weapon skill',
        a2:'finesse',
        tier:2
    },
    'Tainted Psyker':{name:'Tainted Psyker',
        a1:'knowledge',
        a2:'psyker',
        tier:2
    },
    'Two-Weapon Wielder':{name:'Two-Weapon Wielder',
        a1:'weapon skill',
        a2:'finesse',
        tier:2
    },
    'Two-Weapon Wielder':{name:'Two-Weapon Wielder',
        a1:'ballistic skill',
        a2:'finesse',
        tier:2
    },
    'Unarmed Specialist':{name:'Unarmed Specialist',
        a1:'strength',
        a2:'offence',
        tier:2
    },
    'Warp Conduit':{name:'Warp Conduit',
        a1:'willpower',
        a2:'psyker',
        tier:2
    },
    'Whirlwind of Death':{name:'Whirlwind of Death',
        a1:'weapon skill',
        a2:'finesse',
        tier:2
    },
    'Witch Finder':{name:'Witch Finder',
        a1:'knowledge',
        a2:'perception',
        tier:2
    },
    'Xenosavant':{name:'Xenosavant',
        a1:'intelligence',
        a2:'knowledge',
        tier:2
    },
    'Adamantium Faith':{name:'Adamantium Faith',
        a1:'willpower',
        a2:'defence',
        tier:3
    },
    'Aegis of Contempt':{name:'Aegis of Contempt',
        a1:'defence',
        a2:'leadership',
        tier:3
    },
    'Assassin Strike':{name:'Assassin Strike',
        a1:'weapon skill',
        a2:'fieldcraft',
        tier:3
    },
    'Bastion of Iron Will':{name:'Bastion of Iron Will',
        a1:'willpower',
        a2:'psyker',
        tier:3
    },
    'Blademaster':{name:'Blademaster',
        a1:'weapon skill',
        a2:'finesse',
        tier:3
    },
    'Crushing Blow':{name:'Crushing Blow',
        a1:'weapon skill',
        a2:'offence',
        tier:3
    },
    'Daemonic Disruption':{name:'Daemonic Disruption',
        a1:'willpower',
        a2:'general',
        tier:3
    },
    'Dark Soul':{name:'Dark Soul',
        a1:'toughness',
        a2:'willpower',
        tier:3
    },
    'Deathdealer':{name:'Deathdealer',
        a1:'perception',
        a2:'finesse',
        tier:3
    },
    'Delicate Interrogation':{name:'Delicate Interrogation',
        a1:'intelligence',
        a2:'finesse',
        tier:3
    },
    'Divine Protection':{name:'Divine Protection',
        a1:'general',
        a2:'finesse',
        tier:3
    },
    'Eye of Vengeance':{name:'Eye of Vengeance',
        a1:'ballistic skill',
        a2:'offence',
        tier:3
    },
    'Favored by the Warp':{name:'Favored by the Warp',
        a1:'willpower',
        a2:'psyker',
        tier:3
    },
    'Flash of Insight':{name:'Flash of Insight',
        a1:'perception',
        a2:'knowledge',
        tier:3
    },
    'Halo of Command':{name:'Halo of Command',
        a1:'fellowship',
        a2:'leadership',
        tier:3
    },
    'Hammer Blow':{name:'Hammer Blow',
        a1:'strength',
        a2:'offence',
        tier:3
    },
    'Hull Down':{name:'Hull Down',
        a1:'agility',
        a2:'fieldcraft',
        tier:3
    },
    'Indomitable Conviction':{name:'Indomitable Conviction',
        a1:'leadership',
        a2:'willpower',
        tier:3
    },
    'Infused Knowledge':{name:'Infused Knowledge',
        a1:'intelligence',
        a2:'knowledge',
        tier:3
    },
    'Instrument of His Will':{name:'Instrument of His Will',
        a1:'offence',
        a2:'willpower',
        tier:3
    },
    'Into the Jaws of Hell':{name:'Into the Jaws of Hell',
        a1:'leadership',
        a2:'willpower',
        tier:3
    },
    'Iron Faith':{name:'Iron Faith',
        a1:'defence',
        a2:'willpower',
        tier:3
    },
    'Lightning Attack':{name:'Lightning Attack',
        a1:'weapon skill',
        a2:'finesse',
        tier:3
    },
    'Luminen Blast':{name:'Luminen Blast',
        a1:'ballistic skill',
        a2:'tech',
        tier:3
    },
    'Mastery (choose)':{name:'Mastery (choose)',
        a1:'intelligence',
        a2:'knowledge',
        tier:3
    },
    'Mighty Shot':{name:'Mighty Shot',
        a1:'ballistic skill',
        a2:'offence',
        tier:3
    },
    'Never Die':{name:'Never Die',
        a1:'toughness',
        a2:'defence',
        tier:3
    },
    'Preternatural Speed':{name:'Preternatural Speed',
        a1:'agility',
        a2:'offence',
        tier:3
    },
    'Push the Limit':{name:'Push the Limit',
        a1:'perception',
        a2:'tech',
        tier:3
    },
    'Sanctic Purity':{name:'Sanctic Purity',
        a1:'psyker',
        a2:'willpower',
        tier:3
    },
    'Shield Wall':{name:'Shield Wall',
        a1:'defence',
        a2:'weapon skill',
        tier:3
    },
    'Sprint':{name:'Sprint',
        a1:'agility',
        a2:'fieldcraft',
        tier:3
    },
    'Step Aside':{name:'Step Aside',
        a1:'agility',
        a2:'defence',
        tier:3
    },
    'Superior Chirurgeon':{name:'Superior Chirurgeon',
        a1:'intelligence',
        a2:'fieldcraft',
        tier:3
    },
    'Target Selection':{name:'Target Selection',
        a1:'ballistic skill',
        a2:'finesse',
        tier:3
    },
    'Thunder Charge':{name:'Thunder Charge',
        a1:'strength',
        a2:'offence',
        tier:3
    },
    'True Grit':{name:'True Grit',
        a1:'toughness',
        a2:'defence',
        tier:3
    },
    'Two-Weapon Master':{name:'Two-Weapon Master',
        a1:'finesse',
        a2:'offence',
        tier:3
    },
    'Warp Lock':{name:'Warp Lock',
        a1:'willpower',
        a2:'psyker',
        tier:3
    },
    'Weapon Intuition':{name:'Weapon Intuition',
        a1:'intelligence',
        a2:'finesse',
        tier:3
    }
};