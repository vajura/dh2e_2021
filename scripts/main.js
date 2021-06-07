on('ready', () => {
    //sendChat('test', 'started');
    //log('started');
});
const savedRolls = {};

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

function getWeaponSpecials(prefix, weaponId, weaponType, charId) {
    const specials = [];
    for (let a = 1; a < 4; a++) {
        specials.push({
            'val': getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_special${a}`),
            'x': sanitizeToNumber(getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_special${a}_x`))
        });
    }
    return specials;
}

function getWeaponMods(prefix, weaponId, weaponType, charId) {
    const mods = [];
    for (let a = 1; a < 5; a++) {
        mods.push({
            'val': getAttrByName(charId, `${prefix}_${weaponId}_${weaponType}_mod${a}`)
        });
    }
    return mods;
}

function checkWeaponSpecials(specials, result, jam, roll, aimMod, rangeMod) {
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
}
function checkWeaponMods(mods, result, aimMod, rofMod) {
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
}

function calculateAmmoUsage(charId, prefix, weaponId, weaponType, jam, roll, rofMod, supressingFireMode, firingModeMod, fate) {
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
        if (fate && savedRolls[weaponId] && savedRolls[weaponId].ammoBefore) {
            ammo = savedRolls[weaponId].ammoBefore
        }
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
    return {bulletsUsed, ammoBefore};
}

function calcWeaponHit(who, playerId, paramArray, msg, fate) {
    const npc = paramArray[10];
    const charId = paramArray[0];
    let prefix = paramArray[1];
    if (npc) {
        prefix = `npc_${prefix}`;
    }
    let weaponType = 'melee_weapon';
    if (prefix.indexOf('rangedweapons') !== -1) {
        weaponType = 'ranged_weapon';
    }
    if (npc) {
        weaponType = `npc_${weaponType}`;
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
    const roll = sanitizeToNumber(paramArray[9]);
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
    let advancments = {};
    if (!npc) {
        advancments = getAdvancments(charId, ['Marksman', 'Precision Killer (ballistic skill)', 'Precision Killer (weapon skill)']);
    }
    if (weaponType === 'ranged_weapon') {
        result.push('Range');
        result.push(rangeMod);
        result.push('RoF');
        result.push(rofMod);
        if (rangeMod < 0 && advancments['Marksman']) {
            result.push('Marksman');
            result.push(-rangeMod);
        }
        if (rofMod === -20 && supressingFireMode === 'none' && advancments['Precision Killer (ballistic skill)']) {
            result.push('Precision Killer');
            result.push(20);
        }
    }
    if (weaponType === 'melee_weapon') {
        result.push('Attack type');
        result.push(meleeAttackType);
        if (meleeAttackType === -20 && advancments['Precision Killer (weapon skill)']) {
            result.push('Precision Killer');
            result.push(20);
        }
    }
    if (modifier !== 0) {
        result.push('Modifier');
        result.push(modifier);
    }
    result.push('Roll');
    result.push(roll);

    const specials = getWeaponSpecials(prefix, weaponId, weaponType, charId);
    const mods = getWeaponMods(prefix, weaponId, weaponType, charId);
    //log(specials);
    //log(mods);
    checkWeaponSpecials(specials, result, jam, roll, aimMod, rangeMod);
    checkWeaponMods(mods, result, aimMod, rofMod);
    const {bulletsUsed, ammoBefore} = calculateAmmoUsage(charId, prefix, weaponId, weaponType, jam, roll, rofMod, supressingFireMode, firingModeMod, fate);
    if (!npc) {
        saveRollInfo(weaponId, 'ammoBefore', ammoBefore);
        saveRollInfo(weaponId, 'aim', aimMod);
        saveRollInfo(weaponId, 'range', rangeMod);
    }

    postAmmoAndJamInfo(who, charId, prefix, weaponId, weaponType, bulletsUsed, ammoBefore, jam.jammed, playerId);
    postRollTemplateResult(who, playerId, result, weaponId);
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

function postAmmoAndJamInfo(who, charId, prefix, weaponId, weaponType, bulletsUsed, ammoBefore, jammed, playerId) {
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
/*
paramArray:
NAME
...
key
value
key
value
...
Roll
rollValue
*/
function postRollTemplateResult(who, playerId, result, weaponId) {
    const paramMap = {};
    let roll = -1;
    const name = result[0];
    for (let a = 1; a < result.length; a+=2) {
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
        output += ` {{Degreesp=+${degOfSuc}}}`;
    } else {
        degOfSuc = (Math.floor(roll / 10) - Math.floor(target / 10)) + 1;
        output += ` {{Degreesm=-${degOfSuc}}}`;
        degOfSuc = -degOfSuc;
    }
    saveRollInfo(weaponId, 'degOfSuc', degOfSuc);
    sendChat(who, output);
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
    //TODO: fix min max calc if dice 1 is one and tearing is higher
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
    for (let a = 0; a < msg.inlinerolls.length; a++) {
        const inlineroll = msg.inlinerolls[a];
        let previousRolls = 0;
        let newRolls = 0;
        for (let b = 0; b < inlineroll.results.rolls.length; b++) {
            const roll = inlineroll.results.rolls[b];
            if (roll.type === 'R') {
                for (let c = 0; c < roll.results.length; c++) {
                    rollValues.push(roll.results[c].v);
                }
            }
            if (roll.type === 'M') {
                dmgTemplateString += ` {{Added Damage ${mCounter}=${roll.expr}}}`;
                mCounter++;
            }
        }
        totalRoll += inlineroll.results.total;
    }
    rollValues.sort((a, b) => b - a);
    for (let a = 0; a < rollValues.length - 1; a++) {
        dmgTemplateString += ` {{Dice ${rCounter}=${rollValues[a]}}}`;
        rCounter++;
    }
    const lowestDice = rollValues[rollValues.length - 1];
    if (tearingDmg > 0) {
        if (lowestDice >= tearingDmg) {
            dmgTemplateString += ` {{Dice ${rCounter}=${lowestDice}}}`;
            dmgTemplateString += ` {{Tearing=(${tearingDmg})}}`;
        } else {
            dmgTemplateString += ` {{Dice ${rCounter}=(${lowestDice})}}`;
            dmgTemplateString += ` {{Tearing=${tearingDmg}}}`;
            totalRoll = totalRoll - lowestDice + tearingDmg;
        }
    } else {
        dmgTemplateString += ` {{Dice ${rCounter}=${lowestDice}}}`;
    }
    return {dmgTemplateString, totalRoll};
}

function calcWeaponDmg(who, playerId, paramArray, msg) {
    const charId = paramArray[0];
    const prefix = paramArray[1];
    let weaponType = 'melee_weapon';
    if (prefix.indexOf('rangedweapons') !== -1) {
        weaponType = 'ranged_weapon';
    } else if (prefix.indexOf('repeating_psypowers') !== -1) {
        weaponType = 'psy_power';
    }
    const weaponId = paramArray[2];
    let damage = 0;
    const penetration = sanitizeToNumber(paramArray[4]);
    const type = paramArray[5];
    const name = paramArray[6];
    let tearingDmg = 0;
    let specials = [];
    let aimMod = 0;
    let degOfSuc = 0;
    let rangeMod = 0;
    let damageRolls = '';
    if (weaponId && savedRolls[weaponId]) {
        aimMod = savedRolls[weaponId].aim;
        degOfSuc = savedRolls[weaponId].degOfSuc;
        rangeMod = savedRolls[weaponId].range;
    }
    if (weaponType === 'melee_weapon' || weaponType === 'ranged_weapon' ) {
        specials = getWeaponSpecials(prefix, weaponId, weaponType, charId);
        let tearing = false;
        let accurate = false;
        let scatter = false;
        for (let a = 0; a < specials.length; a++) {
            if (specials[a].val === 'tearing') {
                tearing = true;
            }
            if (specials[a].val === 'accurate') {
                accurate = true;
            }
            if (specials[a].val === 'scatter') {
                scatter = true;
            }
        }
        if (tearing) {
            tearingDmg = Math.floor(Math.random() * 10) + 1;
        }
        if (accurate && aimMod > 0) {
            let num = Math.floor((degOfSuc - 1) / 2);
            if (num > 2) {
                num = 2;
            }
            if (num === 1) {
                const accRoll1 = Math.floor(Math.random() * 10) + 1;
                damageRolls += ` {{Accurate 1=${accRoll1}}}`;
                damage += accRoll1;
            } else if (num === 2) {
                const accRoll1 = Math.floor(Math.random() * 10) + 1;
                const accRoll2 = Math.floor(Math.random() * 10) + 1;
                damageRolls += ` {{Accurate 1=${accRoll1}}}`;
                damageRolls += ` {{Accurate 2=${accRoll2}}}`;
                damage += accRoll1;
                damage += accRoll2;
            }
        }
        if (scatter && rangeMod < 10) {
            damageRolls += ` {{Scatter=-3}}`;
            damage += -3;
        }
        if (scatter && rangeMod === 30) {
            damageRolls += ` {{Scatter=3}}`;
            damage += 3;
        }
    }
    if (weaponType === 'ranged_weapon') {
        const advancments = getAdvancments(charId, ['Mighty Shot']);
        if (advancments['Mighty Shot']) {
            let mightyShot = sanitizeToNumber(getAttrByName(charId, `ballistic_skill`));
            mightyShot = (Math.floor(mightyShot / 10)) / 2;
            mightyShot = Math.ceil(mightyShot);
            damage += mightyShot;
            damageRolls += `{{Mighty Shot=${mightyShot}}}`;
        }
    }
    if (weaponType === 'melee_weapon') {
        const advancments = getAdvancments(charId, ['Crushing Blow']);
        if (advancments['Crushing Blow']) {
            let crushingBlow = sanitizeToNumber(getAttrByName(charId, `weapon_skill`));
            crushingBlow = (Math.floor(crushingBlow / 10)) / 2;
            crushingBlow = Math.ceil(crushingBlow);
            damage += crushingBlow;
            damageRolls += `{{Crushing Blow=${crushingBlow}}}`;
        }
    }
    let border = '';
    const {min, max} = checkMinMax(msg, tearingDmg);
    if (min) {
        border = 'rolltemplate-container-damage-value-min';
    }
    if (max) {
        border = 'rolltemplate-container-damage-value-max';
    }
    const {dmgTemplateString, totalRoll} = getDmgTemplateString(msg, tearingDmg);
    damage += totalRoll;
    damageRolls = dmgTemplateString + ' ' + damageRolls;
    let output = `&{template:dh2e2021damage} {{Name=${name}}}`;
    output += ` {{Who=${who}}}`;
    output += ` {{Damage=${damage}}}`;
    output += ` {{Penetration=${penetration}}}`;
    output += ` {{Type=${type}}}`;
    output += ` {{Border=${border}}}`;
    output += damageRolls;
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
    if (roll % 11 === 0 || roll === 100) {
        sendChat(who, `Something stirs in the warp... <br/>Roll for Psychic Phenomena`);
    }
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
    postHitLocationInfo(who, roll);
    if (roll % 11 === 0 || roll === 100) {
        sendChat(who, `Something stirs in the warp... <br/>Roll for Psychic Phenomena`);
    }
}

let getAdvancmentsEnabled = false;
function getAdvancments(charId, advNames) {
    const values = {};
    if (getAdvancmentsEnabled) {
        let allAttributes = findObjs({
            type: 'attribute',
            characterid: charId,
        });
        for (let a = 0; a < allAttributes.length; a++) {
            const name = allAttributes[a].get('name');
            if (name && name.indexOf(`_auto_advancement`) > -1) {
                const current = allAttributes[a].get('current');
                for (let b = 0; b < advNames.length; b++) {
                    const advName = advNames[b];
                    if (current === advName) {
                        values[advName] = true;
                    }
                }
            }
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

on('chat:message', function (msg) {
    const playerId = msg.playerid;
    const rollCmd = '!dh2e2021roll ';
    const weaponHitCmd = '!dh2e2021weaponhit ';
    const weaponDamageCmd = '!dh2e2021damage ';
    const fateCmd = '!dh2e2021fate ';
    const focusPowerCmd = '!dh2e2021focuspower ';
    const psyHitCmd = '!dh2e2021psyhit ';
    const toggleCmd = '!dh2e2021toggle ';
    const disableToggleCmd = '!dh2e2021toggle';
    const notSavedRolls = [toggleCmd, disableToggleCmd];
    let fate = false;
    //log(JSON.stringify(msg, undefined, 2));
    const commands = [
        {cmd: rollCmd, fn: postRollTemplateResult},
        {cmd: weaponHitCmd, fn: calcWeaponHit},
        {cmd: weaponDamageCmd, fn: calcWeaponDmg},
        {cmd: focusPowerCmd, fn: calcFocusPower},
        {cmd: psyHitCmd, fn: calcPsyHit},
        {cmd: toggleCmd, fn: toggleGetAdvancments},
        {cmd: disableToggleCmd, fn: disableGetAdvancments}
    ];
    if (msg.type !== 'api') {
        return;
    }
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