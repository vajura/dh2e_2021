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

on('change:attribute', (ev) => {
    const charId = ev.get('_characterid');
    const eventName = ev.get('name');
    const eventValue = ev.get('current');
    //log(`Change ${eventName} ${eventValue}`);

    calcCharacteristics(charId, eventName);
    calcWounds(charId, eventName);
    calcCarryLimit(charId, eventName);
    checkIfHiddenApiTrigger(eventName, eventValue, charId);
});

on('add:attribute', (ev) => {
    const charId = ev.get('_characterid');
    const eventName = ev.get('name');
    const eventValue = ev.get('current');
    //log(`Add ${eventName} ${eventValue}`);

    calcCharacteristics(charId, eventName);
    calcWounds(charId, eventName);
    calcCarryLimit(charId, eventName);
    checkIfHiddenApiTrigger(eventName, eventValue, charId);
});


function checkIfHiddenApiTrigger(eventName, eventValue, charId) {
    if (eventName === 'hidden_api_trigger' && eventValue === 'calc_all_fields_2') {
        calcAllCharacteristics(charId);
        calcWounds(charId, 'max_base_wounds');
    }
}

function calcCarryLimit(charId, eventName) {
    if (eventName.indexOf('strength') !== -1 || eventName.indexOf('toughness') !== -1) {
        const weightMap = {
            0: 0.9,1: 2.25,2: 4.5,3: 9,4: 18,5: 27,6: 36,7: 45,8: 56,9: 67,10: 78,11: 90,12: 112,13: 225,14: 337,15: 450,16: 675,17: 900,18: 1.350,19: 1.800,20: 2.250
        };
        const strength = getAttrByName(charId, `strength`);
        const toughness = getAttrByName(charId, `toughness`);
        const sum = weightMap[Math.floor(sanitizeToNumber(strength) / 10) + Math.floor(sanitizeToNumber(toughness) / 10)];
        const maxCarry = findObjs({
            type: 'attribute',
            characterid: charId,
            name: 'max_carry'
        }, {caseInsensitive: true})[0];
        if (maxCarry) {
            maxCarry.set('current', sum.toFixed(2) + ' kg');
        }
    }
}

function calcWounds(charId, eventName) {
    if (eventName.indexOf('max_base_wounds') !== -1) {
        const baseValue = getAttrByName(charId, `max_base_wounds`);
        const attribute = findObjs({
            type: 'attribute',
            characterid: charId,
            name: 'max_wounds'
        }, {caseInsensitive: true})[0];
        if (attribute !== undefined) {
            attribute.set('current', sanitizeToNumber(baseValue));
        }
    }
}

function calcAllCharacteristics(charId) {
    if (charId !== undefined) {
        for (let a = 0; a < Characteristics.length; a++) {
            calcCharacteristics(charId, Characteristics[a]);
        }
    }
}

function calcCharacteristics(charId, eventName) {
    let attributeName = '';
    for (let a = 0; a < Characteristics.length; a++) {
        if (eventName.indexOf(Characteristics[a]) !== -1) {
            attributeName = Characteristics[a];
            break;
        }
    }
    if (attributeName === '') {
        return;
    }

    const baseValue = getAttrByName(charId, `base_${attributeName}`);
    let advancesValue = 0;
    if (attributeName !== 'influence') {
        advancesValue = getAttrByName(charId, `advance_${attributeName}`);
    }
    const attribute = findObjs({
        type: 'attribute',
        characterid: charId,
        name: attributeName
    }, {caseInsensitive: true})[0];
    if (attribute !== undefined) {
        attribute.set('current', sanitizeToNumber(baseValue) + sanitizeToNumber(advancesValue));
    }
}

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

/*
!dh2e2021weaponhit
@{character_id}, 
repeating_rangedweapons, 
@{hidden_row_id},
@{ballistic_skill},
[[?{Aim |Half aim (+10),+10|No aim (+0),+0|Full aim (+20),+20}]],
[[?{Range |Short Range (+10),+10|Standard range (+0),+0|Point Blank (+30),+30|Long Range (-10),-10|Extreme Range (-30),-30}]],
[[?{Rate of Fire|Standard (+10),+10|Semi auto (+0),+0|Full Auto (-10),-10|Called Shot (-20),-20|Suppressing Fire (-20),-20}]],
[[?{Firing Mode|Normal,1|Overcharge,2|Maximal,3|Overload,4}]],[[?{Modifier|0})]]

repeating_rangedweapons_-MaJkoNLugyRt7kU4fHq_ranged_weapon_special1
repeating_rangedweapons_-MaJkoNLugyRt7kU4fHq_ranged_weapon_mod1
*/
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

// !dh2e2021focuspower @{character_id},Willpower,@{willpower},@{psy_rating},[[?{Psy Use?|1}]],0,[[?{Modifier|0}]]
// "!roll40k @{character_name}'s channelled Willpower, @{Willpower},[[(@{PsyRating} - ?{Psy Use?|1}) *10 + ?{Modifier|0}]]"
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