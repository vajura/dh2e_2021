const savedRolls = {};
let getAdvancmentsEnabled = true;
let logging = false;
let hitCounter = 1;
const Characteristics = ['weapon_skill','ballistic_skill','strength','toughness','agility','intelligence','perception','willpower','fellowship','influence'];

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

function getWeaponSpecials(wData) {
    const specials = [];
    for (let a = 1; a < 4; a++) {
        specials.push({
            'val': getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_special${a}`),
            'x': sanitizeToNumber(getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_special${a}_x`))
        });
    }
    wData.specials = specials;
}

function getWeaponMods(wData) {
    const mods = [];
    for (let a = 1; a < 5; a++) {
        mods.push({
            'val': getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_mod${a}`)
        });
    }
    wData.mods = mods;
}

function addWeaponSpecialsToHitResult(wData, result) {
    for (let a = 0; a < wData.specials.length; a++) {
        switch(wData.specials[a].val) {
            case 'accurate':
                if (wData.aimMod > 0) {
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
                if (wData.rangeMod === 30 || wData.rangeMod === 10) {
                    result.push('Scatter');
                    result.push(10);
                }
            break;
            case 'unreliable':
                wData.jam.status = 'unreliable';
                if (wData.roll >= 91) {
                    wData.jam.jammed = true;
                }
            break;
            case 'reliable':
                wData.jam.status = 'reliable';
                if (wData.roll >= 100) {
                    wData.jam.jammed = true;
                }
            break;
            case 'overheats':
                wData.jam.status = 'overheats';
                if (wData.roll >= 91) {
                    wData.jam.jammed = true;
                }
            break;
        }
    }
    if (wData.firingModeMod === 4) {
        wData.jam.status = 'unreliable';
        if (wData.roll >= 91) {
            wData.jam.jammed = true;
        }
    }
}

function addWeaponModsToHitResult(wData, result) {
    for (let a = 0; a < wData.mods.length; a++) {
        if (result.includes(wData.mods[a].val)) {
            continue;
        }
        switch(wData.mods[a].val) {
            case 'custom_grip':
                result.push('Custom grip');
                result.push(5);
            break;
            case 'fluid_action':
                if (wData.rofMod === 0) {
                    result.push('Fluid action');
                    result.push(10);
                }
            break;
            case 'modified_stock':
                if (wData.aimMod === 10) {
                    result.push('Modified stock');
                    result.push(2);
                }
                if (wData.aimMod === 20) {
                    result.push('Modified stock');
                    result.push(4);
                }
            break;
            case 'motion_predictor':
                if (wData.rofMod === 0 || wData.rofMod === -10) {
                    result.push('Motion predictor');
                    result.push(10);
                }
            break;
            case 'red_dot_laser_sight':
                if (wData.rofMod === 10) {
                    result.push('Red dot');
                    result.push(10);
                }
            break;
            case 'omni_scope':
                if (wData.rofMod === 10) {
                    result.push('Omni scope');
                    result.push(10);
                }
                if (wData.aimMod === 20) {
                    result[6] = 0;
                }
            break;
            case 'telescopic_sight':
                if (wData.aimMod === 20) {
                    result[6] = 0;
                }
            break;
        }
    }
}

function calculateAmmoUsage(wData, fate) {
    let bulletsUsed = 0;
    let ammoBefore = 0;
    if (wData.weaponType.indexOf('ranged_weapon') !== -1) {
        const semiAuto = sanitizeToNumber(getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_semi`));
        const fullAuto = sanitizeToNumber(getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_full`));
        wData.bulletsUsedSemiAuto = semiAuto;
        wData.bulletsUsedfullAuto = fullAuto;
        const currentAmmo = findObjs({
            type: 'attribute',
            characterid: wData.charId,
            name: `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_clip`
        }, {caseInsensitive: true})[0];
        let ammo = sanitizeToNumber(currentAmmo.get('current'));
        if (fate && savedRolls[wData.weaponId] && savedRolls[wData.weaponId].ammoBefore) {
            ammo = savedRolls[wData.weaponId].ammoBefore
        }
        ammoBefore = ammo;
        if (wData.rofMod === 10 || (wData.rofMod === -20 && wData.supressingFireMode === 'none')) {
            if (wData.jam.status === '' && wData.roll >= 96) {
                wData.jam.jammed = true;
            }
            bulletsUsed = 1 * wData.firingModeMod;
        } else if (wData.rofMod === 0) {
            if (wData.jam.status === '' && wData.roll >= 94) {
                wData.jam.jammed = true;
            }
            bulletsUsed = semiAuto * wData.firingModeMod;
        } else if (wData.rofMod === -10) {
            if (wData.jam.status === '' && wData.roll >= 94) {
                wData.jam.jammed = true;
            }
            bulletsUsed = fullAuto * wData.firingModeMod;
        } else if (wData.supressingFireMode === 'semi') {
            if (wData.jam.status === '' && wData.roll >= 94) {
                wData.jam.jammed = true;
            }
            bulletsUsed = semiAuto * wData.firingModeMod;
        } else if (wData.supressingFireMode === 'auto') {
            if (wData.jam.status === '' && wData.roll >= 94) {
                wData.jam.jammed = true;
            }
            bulletsUsed = fullAuto * wData.firingModeMod;
        } else {
            if (wData.jam.status === '' && wData.roll >= 96) {
                wData.jam.jammed = true;
            }
            bulletsUsed = 1 * wData.firingModeMod;
        }
        if (wData.jam.jammed && wData.jam.status !== 'overheats') {
            bulletsUsed = ammo;
            ammo = 0;
        }
        ammo -= bulletsUsed;
        if (ammo < 0) {
            ammo = 0;
        }
        currentAmmo.set('current', ammo);
    }
    return {bulletsUsed, ammoBefore};
}

function getwData(paramArray) {
    const wData = {};
    wData.npc = paramArray[11];
    wData.charId = paramArray[0];
    wData.prefix = paramArray[1];
    wData.weaponType = 'melee_weapon';
    if (wData.prefix.indexOf('rangedweapons') !== -1) {
        wData.weaponType = 'ranged_weapon';
    }
    if (wData.npc) {
        wData.prefix = `repeating_npc`;
        wData.weaponType = `npc_${wData.weaponType}`;
    }
    wData.weaponId = paramArray[2];
    wData.skill = sanitizeToNumber(paramArray[3]);
    wData.uSkill = sanitizeToNumber(paramArray[4]);
    wData.aimMod = sanitizeToNumber(paramArray[5]);
    wData.rangeMod = sanitizeToNumber(paramArray[6]);
    wData.meleeAttackType = sanitizeToNumber(paramArray[6]);
    wData.rofMod = sanitizeToNumber(paramArray[7]);
    wData.supressingFireMode = 'none';
    if (wData.rofMod === -21) {
        wData.supressingFireMode = 'semi';
        wData.rofMod = -20;
    } else if (wData.rofMod === -22) {
        wData.supressingFireMode = 'auto';
        wData.rofMod = -20;
    }
    wData.firingModeMod = sanitizeToNumber(paramArray[8]);
    wData.modifier = sanitizeToNumber(paramArray[9]);
    wData.roll = sanitizeToNumber(paramArray[10]);
    wData.jam = {
        jammed: false,
        status: ''
    };
    return wData;
}

function postHitLocationAndHitsInfo(who, roll, attackType, degOfSuc, wData) {
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
    if (wData !== undefined && attackType !== undefined && degOfSuc >= 0) {
        let hitsText = "";
        degOfSuc--;
        let hitsNumber = 1;
        if (attackType === -10 || wData.supressingFireMode === 'auto') {
            hitsNumber = degOfSuc + 1;
            if (wData && wData.weaponType.indexOf('ranged_weapon') !== -1 && hitsNumber > wData.bulletsUsedfullAuto) {
                hitsNumber = wData.bulletsUsedfullAuto;
            }
        } else if (attackType === 0 || wData.supressingFireMode === 'semi') {
            hitsNumber = Math.floor(degOfSuc / 2) + 1;
            if (wData && wData.weaponType.indexOf('ranged_weapon') !== -1 && hitsNumber > wData.bulletsUsedSemiAuto) {
                hitsNumber = wData.bulletsUsedSemiAuto;
            }
        }
        hitsText += `with a total of ${hitsNumber} hit/s.`;
        saveRollInfo(wData.weaponId, 'totalHits', hitsNumber);
        sendChat(who, `Location ${hitLocation} hits ${hitPart} ${hitsText}`);
    } else {
        sendChat(who, `Location ${hitLocation} hits ${hitPart}.`);
    }
}

function calcWeaponHit(who, playerId, paramArray, msg, fate) {
    const wData = getwData(paramArray);
    const result = [];
    result.push(getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_name`));
    if (wData.weaponType.indexOf('ranged_weapon') !== -1) {
        result.push('Ballistic skill');
    } else {
        result.push('Weapon skill');
    }
    result.push(wData.skill);
    result.push('Aim');
    result.push(wData.aimMod);
    wData.advancments = {};
    if (!wData.npc) {
        wData.advancments = getAdvancments(wData.charId, ['Marksman', 'Precision Killer (ballistic skill)', 'Precision Killer (weapon skill)']);
    }
    if (wData.weaponType.indexOf('ranged_weapon') !== -1) {
        result.push('Range');
        result.push(wData.rangeMod);
        result.push('RoF');
        result.push(wData.rofMod);
        if (wData.rangeMod < 0 && wData.advancments['Marksman']) {
            result.push('Marksman');
            result.push(-wData.rangeMod);
        }
        if (wData.rofMod === -20 && wData.supressingFireMode === 'none' && wData.advancments['Precision Killer (ballistic skill)']) {
            result.push('Precision Killer');
            result.push(20);
        }
    }
    if (wData.weaponType.indexOf('melee_weapon') !== -1) {
        result.push('Attack type');
        result.push(wData.meleeAttackType);
        if (wData.meleeAttackType === -20 && wData.advancments['Precision Killer (weapon skill)']) {
            result.push('Precision Killer');
            result.push(20);
        }
    }
    if (wData.modifier !== 0) {
        result.push('Modifier');
        result.push(wData.modifier);
    }
    result.push('Roll');
    result.push(wData.roll);

    getWeaponSpecials(wData);
    getWeaponMods(wData);
    addWeaponSpecialsToHitResult(wData, result);
    addWeaponModsToHitResult(wData, result);
    const {bulletsUsed, ammoBefore} = calculateAmmoUsage(wData, fate);
    wData.bulletsUsed = bulletsUsed;
    wData.ammoBefore = ammoBefore;
    saveRollInfo(wData.weaponId, 'ammoBefore', wData.ammoBefore);
    saveRollInfo(wData.weaponId, 'aim', wData.aimMod);
    saveRollInfo(wData.weaponId, 'range', wData.rangeMod);
    saveRollInfo(wData.weaponId, 'rof', wData.rofMod);
    saveRollInfo(wData.weaponId, 'firingModeMod', wData.firingModeMod);

    postAmmoAndJamInfo(who, playerId, wData);
    const degOfSuc = postRollTemplateResult(who, playerId, result, wData.weaponId, wData.uSkill);
    if (!wData.jam.jammed && degOfSuc > 0) {
        if (wData.weaponType.indexOf('ranged_weapon') !== -1) {
            postHitLocationAndHitsInfo(who, wData.roll, wData.rofMod, degOfSuc, wData);
        } else {
            postHitLocationAndHitsInfo(who, wData.roll, wData.meleeAttackType, degOfSuc, wData);
        }
    }
    hitCounter = 1;
}

function postAmmoAndJamInfo(who, playerId, wData) {
    const weaponName = getAttrByName(wData.charId, `${wData.prefix}_${wData.weaponId}_${wData.weaponType}_name`);
    const playerName = getAttrByName(wData.charId, `player_name`);
    if (playerIsGM(playerId) && playerName.indexOf('npc') === -1) {
        return;
    }
    if (wData.weaponType.indexOf('ranged_weapon') !== -1) {
        const remainingAmmo = wData.ammoBefore - wData.bulletsUsed;
        sendChat(who, `<br/><div style="padding:5px;font-style:italic;text-align: center;font-weight: bold;background-color:#F5E4D3;color:#653E10">${who} whispers "Emperor Guide my Bullet"<div>`);
        sendChat(who, `${weaponName} expends ${wData.bulletsUsed} ammo, ${remainingAmmo} left.`);
        if (remainingAmmo < 0) {
            sendChat(who, `<div style="color:red;">${weaponName} used more ammo then it had.</div>`);
        }
        if (wData.jam.jammed && wData.jam.status === 'overheats') {
            sendChat(who, `<div style="color:red;">${weaponName} has overheated.</div>`);
        } else if (wData.jam.jammed) {
            sendChat(who, `<div style="color:red;">${weaponName} has jammed.</div>`);
        }
    } else {
        sendChat(who, `<br/><div style="padding:5px;font-style:italic;text-align: center;font-weight: bold;background-color:#F5E4D3;color:#653E10">${who} exclaims "Be cut apart by the Emperors wrath"<div>`);
    }
}

function postRollTemplateResult(who, playerId, result, weaponId, uSkill) {
    const paramMap = {};
    let roll = -1;
    const name = result[0];
    for (let a = 1; a < result.length; a += 2) {
        if (result[a] === 'Roll') {
            roll = sanitizeToNumber(result[a + 1]);
        } else {
            paramMap[result[a]] = sanitizeToNumber(result[a + 1]);
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
        if (uSkill !== undefined) {
            degOfSuc += uSkill;
        }
        output += ` {{Degreesp=+${degOfSuc}}}`;
    } else {
        degOfSuc = (Math.floor(roll / 10) - Math.floor(target / 10)) + 1;
        output += ` {{Degreesm=-${degOfSuc}}}`;
        degOfSuc = -degOfSuc;
    }
    if (typeof weaponId === 'string') {
        saveRollInfo(weaponId, 'degOfSuc', degOfSuc);
    }
    sendChat(who, output);
    return degOfSuc;
}

function saveRollInfo(id, key, value) {
    if (id === undefined || typeof id !== 'string') {
        return
    }
    if (savedRolls[id] === undefined) {
        savedRolls[id] = {};
    }
    savedRolls[id][key] = value;
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

/*
type R
    roll
type M
    + or - value like "+4", "+4+22", "-2-22+22"
    will always be "+4+58-58" without space
    can also be direct number 10
type C
    can be ignored
*/
function checkMinMax(msg, tearingDmg) {
    let min = false;
    let max = false;
    for (let a = 0; a < msg.inlinerolls.length; a++) {
        const inlineroll = msg.inlinerolls[a];
        let previousRolls = 0;
        let newRolls = 0;
        for (let b = 0; b < inlineroll.results.rolls.length; b++) {
            const roll = inlineroll.results.rolls[b];
            if (roll.type === 'R') {
                for (let c = 0; c < roll.results.length; c++) {
                    if (roll.results[c].v === roll.sides) {
                        max = true;
                    }
                    if (roll.results[c].v === 1) {
                        min = true;
                    }
                }
            }
        }
    }
    if (min && tearingDmg > 1) {
        min = false;
    }
    //TODO: fix min max calc if dice is one and tearing is higher
    if (tearingDmg === 10) {
        max = true;
    }
    return {min, max};
}

function rerollMsg(msg) {
    let totalRoll = 0;
    for (let a = 0; a < msg.inlinerolls.length; a++) {
        const inlineroll = msg.inlinerolls[a];
        let previousRolls = 0;
        let newRolls = 0;
        for (let b = 0; b < inlineroll.results.rolls.length; b++) {
            const roll = inlineroll.results.rolls[b];
            if (roll.type === 'R') {
                for (let c = 0; c < roll.results.length; c++) {
                    previousRolls += roll.results[c].v;
                    roll.results[c].v = Math.floor(Math.random() * roll.sides) + 1;
                    newRolls += roll.results[c].v;
                }
            }
        }
        inlineroll.results.total = inlineroll.results.total - previousRolls + newRolls;
        totalRoll += inlineroll.results.total;
    }
    return totalRoll;
}

function getDmgTemplateString(msg, tearingDmg) {
    let dmgTemplateString = '';
    let rCounter = 1;
    let mCounter = 1;
    let rollValues = [];
    let totalRoll = 0;
    let addedDamageValues = [];
    for (let a = 0; a < msg.inlinerolls.length; a++) {
        const inlineroll = msg.inlinerolls[a];
        let previousRolls = 0;
        let newRolls = 0;
        for (let b = 0; b < inlineroll.results.rolls.length; b++) {
            const roll = inlineroll.results.rolls[b];
            if (roll.type === 'R') {
                for (let c = 0; c < roll.results.length; c++) {
                    rollValues.push({val: roll.results[c].v, sides: roll.sides});
                }
            }
            if (roll.type === 'M') {
                addedDamageValues.push(roll.expr);
            }
        }
        totalRoll += inlineroll.results.total;
    }
    rollValues.sort((a, b) => b.val - a.val);
    for (let a = 0; a < rollValues.length - 1; a++) {
        dmgTemplateString += ` {{Dice ${rCounter} 1d${rollValues[a].sides}=+${rollValues[a].val}}}`;
        rCounter++;
    }
    const lowestDice = rollValues[rollValues.length - 1];
    if (tearingDmg > 0) {
        if (lowestDice.val >= tearingDmg) {
            dmgTemplateString += ` {{Dice ${rCounter} 1d${lowestDice.sides}=+${lowestDice.val}}}`;
            dmgTemplateString += ` {{Tearing=(+${tearingDmg})}}`;
        } else {
            dmgTemplateString += ` {{Dice ${rCounter} 1d${lowestDice.sides}=(+${lowestDice.val})}}`;
            dmgTemplateString += ` {{Tearing=+${tearingDmg}}}`;
            totalRoll = totalRoll - lowestDice.val + tearingDmg;
        }
    } else {
        dmgTemplateString += ` {{Dice ${rCounter} 1d${lowestDice.sides}=+${lowestDice.val}}}`;
    }
    for (let a = 0; a < addedDamageValues.length; a++) {
        dmgTemplateString += ` {{Added Damage ${mCounter}=${addedDamageValues[a]}}}`;
        mCounter++;
    }
    return {dmgTemplateString, totalRoll};
}

function getWdData(paramArray) {
    const wdData = {};
    wdData.npc = paramArray[9];
    wdData.charId = paramArray[0];
    wdData.prefix = paramArray[1];
    wdData.weaponType = 'melee_weapon';
    if (wdData.prefix.indexOf('rangedweapons') !== -1) {
        wdData.weaponType = 'ranged_weapon';
    } else if (wdData.prefix.indexOf('repeating_psypowers') !== -1) {
        wdData.weaponType = 'psy_power';
    }
    if (wdData.npc) {
        wdData.prefix = `repeating_npc`;
        wdData.weaponType = `npc_${wdData.weaponType}`;
    }
    wdData.weaponId = paramArray[2];
    wdData.damage = 0;
    wdData.penetration = sanitizeToNumber(paramArray[4]);
    wdData.type = paramArray[5];
    wdData.name = paramArray[6];
    wdData.psyRating = sanitizeToNumber(paramArray[7]);
    wdData.strength = sanitizeToNumber(paramArray[7]);
    wdData.uStrength = sanitizeToNumber(paramArray[8]);
    wdData.tearingDmg = 0;
    wdData.specials = [];
    wdData.aimMod = 0;
    wdData.degOfSuc = 0;
    wdData.rangeMod = 0;
    wdData.rofMod = 0;
    return wdData;
}

function calcDamage(who, playerId, paramArray, msg) {
    const wdData = getWdData(paramArray)
    let damageRolls = '';
    if (wdData.weaponId && savedRolls[wdData.weaponId]) {
        wdData.aimMod = savedRolls[wdData.weaponId].aim;
        wdData.degOfSuc = savedRolls[wdData.weaponId].degOfSuc;
        wdData.rangeMod = savedRolls[wdData.weaponId].range;
        wdData.rofMod = savedRolls[wdData.weaponId].rof;
        wdData.totalHits = savedRolls[wdData.weaponId].totalHits;
        wdData.firingModeMod = savedRolls[wdData.weaponId].firingModeMod;
    }
    if (wdData.weaponType.indexOf('melee_weapon') !== -1 || wdData.weaponType.indexOf('ranged_weapon') !== -1  ) {
        getWeaponSpecials(wdData);
        wdData.tearing = false;
        wdData.accurate = false;
        wdData.scatter = false;
        for (let a = 0; a < wdData.specials.length; a++) {
            if (wdData.specials[a].val === 'tearing') {
                wdData.tearing = true;
            }
            if (wdData.specials[a].val === 'accurate') {
                wdData.accurate = true;
            }
            if (wdData.specials[a].val === 'scatter') {
                wdData.scatter = true;
            }
        }
        if (wdData.tearing) {
            wdData.tearingDmg = Math.floor(Math.random() * 10) + 1;
        }
        if (wdData.accurate && wdData.aimMod > 0 && wdData.rofMod === 10) {
            let num = Math.floor((wdData.degOfSuc - 1) / 2);
            if (num > 2) {
                num = 2;
            }
            if (num === 1) {
                const accRoll1 = Math.floor(Math.random() * 10) + 1;
                damageRolls += ` {{Accurate 1=+${accRoll1}}}`;
                wdData.damage += accRoll1;
            } else if (num === 2) {
                const accRoll1 = Math.floor(Math.random() * 10) + 1;
                const accRoll2 = Math.floor(Math.random() * 10) + 1;
                damageRolls += ` {{Accurate 1=+${accRoll1}}}`;
                damageRolls += ` {{Accurate 2=+${accRoll2}}}`;
                wdData.damage += accRoll1;
                wdData.damage += accRoll2;
            }
        }
        if (wdData.scatter && wdData.rangeMod < 10) {
            damageRolls += ` {{Scatter=-3}}`;
            wdData.damage += -3;
        }
        if (wdData.scatter && wdData.rangeMod === 30) {
            damageRolls += ` {{Scatter=+3}}`;
            wdData.damage += 3;
        }
        if (wdData.firingModeMod === 2) {
            damageRolls += ` {{Overcharge=+${1}}}`;
            wdData.damage += 1;
        }
        if (wdData.firingModeMod === 3) {
            const maximalRoll = Math.floor(Math.random() * 10) + 1;
            damageRolls += ` {{Maximal=+${maximalRoll}}}`;
            wdData.damage += maximalRoll;
            wdData.penetration += 2;
        }
        if (wdData.firingModeMod === 4) {
            damageRolls += ` {{Overcharge=+${2}}}`;
            wdData.damage += 2;
            wdData.penetration += 2;
        }
    }
    if (wdData.weaponType.indexOf('ranged_weapon') !== -1 && !wdData.npc) {
        const advancments = getAdvancments(wdData.charId, ['Mighty Shot']);
        if (advancments['Mighty Shot']) {
            let mightyShot = sanitizeToNumber(getAttrByName(wdData.charId, `ballistic_skill`));
            mightyShot = (Math.floor(mightyShot / 10)) / 2;
            mightyShot = Math.ceil(mightyShot);
            wdData.damage += mightyShot;
            damageRolls += `{{Mighty Shot=+${mightyShot}}}`;
        }
    }
    if (wdData.weaponType.indexOf('melee_weapon') !== -1 && !wdData.npc) {
        const advancments = getAdvancments(wdData.charId, ['Crushing Blow']);
        if (advancments['Crushing Blow']) {
            let crushingBlow = sanitizeToNumber(getAttrByName(wdData.charId, `weapon_skill`));
            crushingBlow = (Math.floor(crushingBlow / 10)) / 2;
            crushingBlow = Math.ceil(crushingBlow);
            wdData.damage += crushingBlow;
            damageRolls += `{{Crushing Blow=+${crushingBlow}}}`;
        }
    }
    if (wdData.weaponType.indexOf('melee_weapon') !== -1) {
        damageRolls += `{{Strength=+${Math.floor(wdData.strength / 10)}}}`;
        wdData.damage += Math.floor(wdData.strength / 10);
        if (wdData.uStrength > 0) {
            damageRolls += `{{U. Strength=+${wdData.uStrength}}}`;
            wdData.damage += wdData.uStrength;
        }
    }
    if (wdData.weaponType.indexOf('psy_power') !== -1) {
        damageRolls += `{{Psy rating=+${wdData.psyRating}}}`;
        wdData.damage += wdData.psyRating;
    }
    let border = '';
    const {min, max} = checkMinMax(msg, wdData.tearingDmg);
    if (min) {
        border = 'rolltemplate-container-damage-value-min';
    }
    if (max) {
        border = 'rolltemplate-container-damage-value-max';
    }
    let hitCounterString = "";
    if (wdData.totalHits !== undefined) {
        hitCounterString = `(${hitCounter}/${wdData.totalHits})`
    } else {
        hitCounterString = `(${hitCounter})`
    }
    const {dmgTemplateString, totalRoll} = getDmgTemplateString(msg, wdData.tearingDmg);
    wdData.damage += totalRoll;
    damageRolls = dmgTemplateString + ' ' + damageRolls;
    let output = `&{template:dh2e2021damage} {{Name=${wdData.name} ${hitCounterString}}}`;
    output += ` {{Who=${who}}}`;
    output += ` {{Damage=${wdData.damage}}}`;
    output += ` {{Penetration=${wdData.penetration}}}`;
    output += ` {{Type=${(wdData.type[0].toUpperCase() + wdData.type.substr(1))}}}`;
    output += ` {{Border=${border}}}`;
    output += damageRolls;
    hitCounter++;
    sendChat(who, output);
}

function calcFocusPower(who, playerId, paramArray) {
    const charId = paramArray[0];
    const focusName = paramArray[1];
    const characteristic = sanitizeToNumber(paramArray[2]);
    const psyRating = sanitizeToNumber(paramArray[3]);
    const psyUse = sanitizeToNumber(paramArray[4]);
    const psyniscienceSkill = sanitizeToNumber(paramArray[5]) - 20;
    const modifier = sanitizeToNumber(paramArray[6]);
    const roll = sanitizeToNumber(paramArray[7]);
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
    postRollTemplateResult(who, playerId, result);
}

function calcPsyHit(who, playerId, paramArray) {
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
    const roll = sanitizeToNumber(paramArray[13]);

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
    postRollTemplateResult(who, playerId, result);
    postHitLocationAndHitsInfo(who, roll);
    if (roll % 11 === 0 || roll === 100) {
        sendChat(who, `Something stirs in the warp... <br/>Roll for Psychic Phenomena`);
    }
}

function getAdvancments(charId, advNames) {
    const values = {};
    if (!getAdvancmentsEnabled) {
        return values;
    }
    const advNamesMap = {};
    for (let a = 0; a < advNames.length; a++) {
        advNamesMap[advNames[a]] = true;
    }
    let allAttributes = findObjs({
        type: 'attribute',
        characterid: charId,
    });
    for (let a = 0; a < allAttributes.length; a++) {
        const name = allAttributes[a].get('name');
        const current = allAttributes[a].get('current');
        if (name && name.indexOf(`_auto_advancement`) > -1 && advNamesMap[current]) {
            values[current] = true;
        }
    }
    return values;
}

function toggleGetAdvancments(who, playerId, paramArray) {
    const toggle = paramArray[0];
    if (toggle == 'on' || toggle == '1') {
        getAdvancmentsEnabled = true;
    } else {
        getAdvancmentsEnabled = false;
    }
}

function disableGetAdvancments() {
    getAdvancmentsEnabled = false;
}

function toggleLogging(who, playerId, paramArray) {
    const toggle = paramArray[0];
    if (toggle == 'on' || toggle == '1') {
        logging = true;
    } else {
        logging = false;
    }
}

function disableLogging() {
    logging = false;
}

on('chat:message', function (msg) {
    if (msg.type !== 'api') {
        return;
    }
    const playerId = msg.playerid;
    const rollCmd = '!dh2e2021roll ';
    const weaponHitCmd = '!dh2e2021weaponhit ';
    const weaponDamageCmd = '!dh2e2021damage ';
    const fateCmd = '!dh2e2021fate ';
    const focusPowerCmd = '!dh2e2021focuspower ';
    const psyHitCmd = '!dh2e2021psyhit ';
    const toggleCmd = '!dh2e2021toggle ';
    const disableToggleCmd = '!dh2e2021toggle';
    const loggingCmd = '!dh2e2021logging ';
    const disableLoggingCmd = '!dh2e2021logging';
    const notSavedRolls = [toggleCmd, disableToggleCmd];
    let fate = false;
    if (logging) {
        log(JSON.stringify(msg, undefined, 2));
    }
    const commands = [
        {cmd: rollCmd, fn: postRollTemplateResult},
        {cmd: weaponHitCmd, fn: calcWeaponHit},
        {cmd: weaponDamageCmd, fn: calcDamage},
        {cmd: focusPowerCmd, fn: calcFocusPower},
        {cmd: psyHitCmd, fn: calcPsyHit},
        {cmd: toggleCmd, fn: toggleGetAdvancments},
        {cmd: disableToggleCmd, fn: disableGetAdvancments},
        {cmd: loggingCmd, fn: toggleLogging},
        {cmd: disableLoggingCmd, fn: disableLogging}
    ];
    if (msg.content.indexOf(fateCmd) !== -1 && savedRolls[playerId] && savedRolls[playerId].msg) {
        const content = processInlinerolls(msg);
        const paramArray = content.slice(fateCmd.length).split(',');
        if (!useFatePoint(paramArray[0], msg.who)) {
            return;
        }
        msg = savedRolls[playerId].msg
        rerollMsg(msg);
        fate = true;
    }
    for (let a = 0; a < commands.length; a++) {
        if (msg.content.indexOf(commands[a].cmd) !== -1) {
            if (!notSavedRolls.includes(commands[a].cmd)) {
                saveRollInfo(playerId, 'msg', msg);
            }
            const content = processInlinerolls(msg);
            const paramArray = content.slice(commands[a].cmd.length).split(',');
            commands[a].fn(msg.who, playerId, paramArray, msg, fate);
            break;
        }
    }
});