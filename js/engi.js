var stage = $('#stage')[0];
var context = stage.getContext('2d');
var block_size = 64;
var stage_cols = Math.round($(stage).width() / block_size);
var stage_rows = Math.round($(stage).height() / block_size);

var float_epsilon = 1;
var gravity = 4500;
var jump_velocity = -1200;
var jump_cooldown = render_interval * 2;
var run_velocity = 450;

var main_timer = undefined;
var render_interval = 20;
var pic_root = './img';

var trigger_jump = true;

class Block {
    constructor(x, y, w, h, pic, is_draw) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.pic = pic;
        this.is_draw = is_draw;
    }
    setPic(pic) {
        this.pic = pic;
    }
    isDraw() {
        return this.is_draw;
    }
}

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
    add(vec) {
        this.x += vec.x;
        this.y += vec.y;
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
    dot(vec) {
        return this.x * vec.x + this.y * vec.y;
    }
    cross(vec) {
        return this.x * vec.y - vec.x * this.y
    }
    cos(vec) {
        return this.dot(vec) / (this.length() * vec.length());
    }
    sin(vec) {
        return this.cross(vec) / (this.length() * vec.length());
    }
    angle(vec) {
        let l1 = this.length();
        let l2 = vec.length();
        return Math.acos(this.dot(vec) / (l1 * l2)) +
            (this.cross(vec) / (l1 * l2) < 0 ?
                Math.PI :
                0.0
            );
        // return Math.acos(this.cos(vec)) + (this.sin(vec) < 0 ? Math.PI : 0.0);
    }
    normalize() {
        let l = this.length();
        if (Math.abs(l) > Number.EPSILON) {
            return new Vector(
                this.x /= l,
                this.y /= l
            );
        } else {
            return new Vector(0, 0);
        }
    }
    xProjection(vec) {
        return this.dot(vec) / vec.length();
    }
    yProjection(vec) {
        return this.dot(vec) / vec.length();
    }
}

var x_axis = new Vector(1, 0);
var y_axis = new Vector(0, 1);

class MovingBlock {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.is_draw = true;
        this.v = new Vector(0, 5);
        this.is_fall = true;
    }
    setPic(pic) {
        this.pic = pic;
    }
    isDraw() {
        return this.is_draw;
    }
    isFall() {
        return this.is_fall;

    }
    fall() {
        let res = checkCollision(this.x, this.y + this.v.y, this.w, this.h, this.v, 'drop');
        if (res.isCollision()) {
            this.is_fall = false;
            this.v.y = 0;
            for (let i = 0; i < moving_blocks.length; ++i) {
                if (moving_blocks[i].x === this.x && moving_blocks[i].y === this.y) {
                    moving_blocks.splice(i, 1);
                    break;
                }
            }
            if (res.is_x_collision) {
                this.x = res.edge_x;
            }
            if (res.is_y_collision) {
                this.y = res.edge_y;
            }
            blocks.push(new Block(this.x, this.y, this.w, this.h, "drop", true));
            // console.log(new Block(this.x, this.y, this.w, this.h, "", true))
        } else {
            this.y += this.v.y;
        }
    }
}

class CollisionResult {
    constructor() {
        this.edge_x = 0.0;
        this.edge_y = 0.0;
        this.is_x_collision = false;
        this.is_y_collision = false;
    }
    setEdgeX(x) {
        this.edge_x = x;
        this.is_x_collision = true;
    }
    setEdgeY(y) {
        this.edge_y = y;
        this.is_y_collision = true;
    }
    unsetEdgeX() {
        this.edge_x = 0.0;
        this.is_x_collision = false;
    }
    unsetEdgeY() {
        this.edge_y = 0.0;
        this.is_y_collision = false;
    }
    isCollision() {
        return this.is_x_collision || this.is_y_collision;
    }
}

class Character {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.v = new Vector(0.0, 0.0);
        this.is_jump = false;
        this.is_fall = false;
        this.jump_time = 0;
        this.dir = 0;
        this.pic = 'engi.png';
        this.is_reverse_pic = false;
        this.run_cnt = 0;
    }
    incrementRunCount() {
        this.run_cnt = (this.run_cnt + 1) % (8 * 2);
    }
    clearRunCount() {
        this.run_cnt = 0;
    }
    isJump() {
        return this.is_jump;
    }
    isRun() {
        if (Math.abs(this.v.x) > float_epsilon) {
            return true;
        } else {
            return false;
        }
    }
    isFall() {
        return this.is_fall;
    }
    initJump() {
        this.is_jump = true;
        this.v.y = jump_velocity;
        this.jump_time = 0.0;
    }
    initRun(dir) {
        this.dir = dir;
        this.v.x = this.dir === 0 ? -run_velocity : run_velocity;
    }
    stopRun(dir) {
        if (this.dir === dir) {
            this.v.x = 0.0;
        }
    }
    fall() {
        this.v.y = 0.0;
        this.jump_time = 0;
        this.is_jump = true;
    }
    land() {
        this.v.y = 0.0;
        this.jump_time = 0;
        this.is_jump = false;
    }
    updateJump() {
        this.jump_time += render_interval;
    }
    jump() {
        let cur_time = this.jump_time / 1000;
        let next_time = (this.jump_time + render_interval) / 1000;
        /*
        * ∫ (v + at) dt = v (t1 - t2) + 1/2 a (t1^2 - t2^2)
        */
        let dis = this.v.y * (next_time - cur_time) + 0.5 * gravity * (next_time * next_time - cur_time * cur_time);
        // console.log(this.v.y * (next_time) + 0.5 * gravity * (next_time * next_time));
        return dis;
    }
    run() {
        let dis = this.v.x * render_interval / 1000;
        return dis;
    }

    act() {
        if (this.isRun() || this.isJump()) {
            let dis_x = 0.0;
            let dis_y = 0.0;

            if (this.isRun()) {
                if (!checkLeanWall(this.x, this.y, this.w, this.h, this.v)) {
                    dis_x = this.run();
                }
            }
            if (this.isJump()) {
                dis_y = this.jump();
            }
            let vec_y = new Vector(0.0, this.jump_time / 1000 * gravity);
            vec_y.add(this.v);

            let collision_res = checkCollision(Math.floor(this.x + dis_x), Math.floor(this.y + dis_y), this.w, this.h, vec_y, 'engi');

            if (collision_res.isCollision()) {
                if (collision_res.is_x_collision) {
                    this.x = collision_res.edge_x;
                }
                if (collision_res.is_y_collision) {
                    this.y = collision_res.edge_y;
                    if (checkKnockHead(this.x, this.y, this.w, this.h, vec_y)) {
                        this.fall();
                    }
                }
            } else {
                if (this.isRun()) {
                    this.x = Math.floor(this.x + dis_x);
                }
                if (this.isJump()) {
                    this.y = Math.floor(this.y + dis_y);
                    this.updateJump();
                }
            }

            if (!this.isJump()) {
                if (checkUnderEmpty(this.x, this.y, this.w, this.h, vec_y)) {
                    this.fall();
                }
            } else {
                if (!checkUnderEmpty(this.x, this.y, this.w, this.h, vec_y)) {
                    this.land();
                }
            }
        } else {
            if (checkUnderEmpty(this.x, this.y, this.w, this.h, this.v)) {
                this.y += 5;
            }
        }
    }
}

function checkLeanWall(x, y, w, h, v) {
    for (let i = 0; i < blocks.length; ++i) {
        if (
            (
                y <= blocks[i].y && blocks[i].y - y < h ||
                y >= blocks[i].y && y - blocks[i].y < blocks[i].h
            ) &&
            (
                v.x > 0.0 && x === blocks[i].x - w ||
                v.x < 0.0 && x === blocks[i].x + blocks[i].w
            )
        ) {
            return true;
        }
    }
    for (let i = 0; i < moving_blocks.length; ++i) {
        if (
            (
                y <= moving_blocks[i].y && moving_blocks[i].y - y < h ||
                y >= moving_blocks[i].y && y - moving_blocks[i].y < moving_blocks[i].h
            ) &&
            (
                v.x > 0.0 && x === moving_blocks[i].x - w ||
                v.x < 0.0 && x === moving_blocks[i].x + moving_blocks[i].w
            )
        ) {
            return true;
        }
    }
    return false;
}

function checkKnockHead(x, y, w, h, v) {
    for (let i = 0; i < blocks.length; ++i) {
        if (
            (
                x <= blocks[i].x && blocks[i].x - x < w ||
                x >= blocks[i].x && x - blocks[i].x < blocks[i].w
            ) &&
            y === blocks[i].y + blocks[i].h) {
            return true;
        }
    }
    for (let i = 0; i < moving_blocks.length; ++i) {
        if (
            (
                x <= moving_blocks[i].x && moving_blocks[i].x - x < w ||
                x >= moving_blocks[i].x && x - moving_blocks[i].x < moving_blocks[i].w
            ) &&
            y === moving_blocks[i].y + moving_blocks[i].h) {
            return true;
        }
    }
    return false;
}

function checkUnderEmpty(x, y, w, h, v) {
    for (let i = 0; i < blocks.length; ++i) {
        if (
            (
                x <= blocks[i].x && blocks[i].x - x < w ||
                x >= blocks[i].x && x - blocks[i].x < blocks[i].w
            ) &&
            y + h === blocks[i].y) {
            return false;

        }
    }
    for (let i = 0; i < moving_blocks.length; ++i) {
        if (
            (
                x <= moving_blocks[i].x && moving_blocks[i].x - x < w ||
                x >= moving_blocks[i].x && x - moving_blocks[i].x < moving_blocks[i].w
            ) &&
            y + h === moving_blocks[i].y) {
            return false;

        }
    }
    return true;
}

function checkSingleCollision(a, b) {
    /*
    窗体坐标：
    0 -> 100
    \
    v
    100

    笛卡尔坐标：
    100
    ^
    \
    0 -> 100
    */
    // let x1 = a.x;
    // let x2 = a.x + a.w;
    // let y1 = a.y - a.h;
    // let y2 = a.y;
    // let x3 = b.x;
    // let x4 = b.x + b.w;
    // let y3 = b.y - b.h;
    // let y4 = b.y;
    // let untouch_x = x1 >= x4 || x3 >= x2;
    // let untouch_y = y1 >= y4 || y3 >= y2;
    // if (!(untouch_x || untouch_y)) 
    if (!(a.x >= b.x + b.w ||
        b.x >= a.x + a.w ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y)) {//碰撞
        if (a.x == b.x && a.y < b.y ||
            a.x > b.x && a.x + a.w < b.x + b.w && a.y < b.y
        ) {
            return 2;
        } else if (a.x > b.x && a.y == b.y ||
            a.x > b.x && a.y > b.y && a.y + a.h < b.y + b.h
        ) {
            return 0;
        } else if (a.x == b.x && a.y > b.y ||
            a.x > b.x && a.x + a.w < b.x + b.w && a.y > b.y
        ) {
            return 6;
        } else if (a.x < b.x && a.y == b.y ||
            a.x < b.x && a.y > b.y && a.y + a.h < b.y + b.h
        ) {
            return 4;
        } else if (a.x < b.x && a.y < b.y) {
            return 3;
        } else if (a.x > b.x && a.y < b.y) {
            return 1;
        } else if (a.x > b.x && a.y > b.y) {
            return 7;
        } else if (a.x < b.x && a.y > b.y) {
            return 5;
        } else {
            return 8;
        }
    } else {
        return -1;
    }
}

function checkSimpleCollision(a, b) {
    if (!(a.x >= b.x + b.w ||
        b.x >= a.x + a.w ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y)) {//碰撞
        return true;
    } else {
        return false;
    }
}

function convertToDirVector(type) {
    switch (type) {
        case 2:
            return new Vector(0, 1);
        case 0:
            return new Vector(1, 0);
        case 6:
            return new Vector(0, -1);
        case 4:
            return new Vector(-1, 0);
        case 3:
            return new Vector(-1, 1);
        case 1:
            return new Vector(1, 1);
        case 7:
            return new Vector(1, -1);
        case 5:
            return new Vector(-1, -1);
        default:
            return new Vector(0, 0);
    }
}

function checkCollision(x, y, w, h, v, self) {
    let player = new Block(x, y, w, h);
    let res = new CollisionResult();
    let collision_blocks = [];
    let vectors = [];
    for (let i in blocks) {
        let collision_type = checkSingleCollision(player, blocks[i])
        if (collision_type !== -1) {
            vectors.push(convertToDirVector(collision_type));
            if (collision_type >= 0 && collision_type <= 7) {
                collision_blocks.push(blocks[i]);
            }
        }
    }
    if (self === 'engi') {
        for (let i in moving_blocks) {
            let collision_type = checkSingleCollision(player, moving_blocks[i])
            if (collision_type !== -1) {
                vectors.push(convertToDirVector(collision_type));
                if (collision_type >= 0 && collision_type <= 7) {
                    collision_blocks.push(moving_blocks[i]);
                }
            }
        }
    }

    if (collision_blocks.length !== 0) {
        if (vectors.length === 1) {
            let ang = x_axis.angle(vectors[0]);
            // console.log(Math.floor(ang / (Math.PI / 4)))
            switch (Math.floor(ang / (Math.PI / 4))) {
                case 0:
                    res.setEdgeX(collision_blocks[0].x + collision_blocks[0].w);
                    break;
                case 2:
                    res.setEdgeY(collision_blocks[0].y - h)
                    break;
                case 4:
                    res.setEdgeX(collision_blocks[0].x - w)
                    break;
                case 6:
                    res.setEdgeY(collision_blocks[0].y + collision_blocks[0].h)
                    break;
                case 1:
                case 3:
                case 5:
                case 7:
                    let norm_v = v.normalize();
                    let tmp_player = new Block(x, y, w, h);
                    let inc_x = 0.0;
                    let inc_y = 0.0;
                    for (let i = 0; i * i < w * w + h * h; ++i) {
                        inc_x -= norm_v.x;
                        inc_y -= norm_v.y;
                        tmp_player.x = Math.floor(x + inc_x);
                        tmp_player.y = Math.floor(y + inc_y);
                        if (!checkSimpleCollision(tmp_player, collision_blocks[0])) {
                            break;
                        }
                    }
                    if (Math.abs(tmp_player.x - x) > Number.EPSILON) {
                        res.setEdgeX(tmp_player.x)
                    }
                    if (Math.abs(tmp_player.y - y) > Number.EPSILON) {
                        res.setEdgeY(tmp_player.y)
                    }
                    break;
                default: break;
            }
        } else if (vectors.length > 1) {
            let sum_v = vectors[0];
            for (let i = 1; i < vectors.length; ++i) {
                sum_v.add(vectors[i]);
            }
            let ang = x_axis.angle(sum_v);
            // console.log(Math.floor(ang / (Math.PI / 4)))
            let poses = [];
            switch (Math.floor(ang / (Math.PI / 4))) {
                case 0:
                    for (let i = 0; i < collision_blocks.length; ++i) {
                        poses.push(collision_blocks[i].x + collision_blocks[i].w)
                    }
                    res.setEdgeX(Math.max.apply(Math, poses));
                    break;
                case 2:
                    for (let i = 0; i < collision_blocks.length; ++i) {
                        poses.push(collision_blocks[i].y - h)
                    }
                    res.setEdgeY(Math.min.apply(Math, poses))
                    break;
                case 4:
                    for (let i = 0; i < collision_blocks.length; ++i) {
                        poses.push(collision_blocks[i].x - w)
                    }
                    res.setEdgeX(Math.min.apply(Math, poses))
                    break;
                case 6:
                    for (let i = 0; i < collision_blocks.length; ++i) {
                        poses.push(collision_blocks[i].y + collision_blocks[i].h)
                    }
                    res.setEdgeY(Math.max.apply(Math, poses))
                    break;
                case 1:
                case 3:
                case 5:
                case 7:
                    let norm_v = v.normalize();
                    let tmp_player = new Block(x, y, w, h);
                    let inc_x = 0.0;
                    let inc_y = 0.0;
                    for (let i = 0; i * i < w * w + h * h; ++i) {
                        inc_x -= norm_v.x;
                        inc_y -= norm_v.y;
                        tmp_player.x = Math.floor(x + inc_x);
                        tmp_player.y = Math.floor(y + inc_y);
                        let check_res = true;
                        for (let j = 0; j < collision_blocks.length; ++j) {
                            check_res &= !checkSimpleCollision(tmp_player, collision_blocks[j]) ? true : false;
                        }
                        if (check_res) {
                            break;
                        }
                    }
                    if (Math.abs(tmp_player.x - x) > Number.EPSILON) {
                        res.setEdgeX(tmp_player.x)
                    }
                    if (Math.abs(tmp_player.y - y) > Number.EPSILON) {
                        res.setEdgeY(tmp_player.y)
                    }
                    break;
                default: break;
            }
        }
    }

    return res;
}

function sleep(time) {
    return new Promise((resovle) => setTimeout(resovle, time));
}

function phy(x) {
    return x * block_size;
}

function genGround() {
    let res = [];
    for (let i = 0; i < stage_cols; ++i) {
        res.push(new Block(phy(i), phy(stage_rows - 1), block_size, block_size, 'ground', true));
    }
    // console.log(res)
    for (let i = 0; i < stage_rows - 1; ++i) {
        res.push(new Block(phy(-1), phy(i), block_size, block_size, 'ground', false));
        res.push(new Block(phy(stage_cols), phy(i), block_size, block_size, 'ground', false));
    }
    // res.push(new Block(phy(10), phy(stage_rows - 2), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(10), phy(stage_rows - 2), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(10), phy(stage_rows - 3), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(16), phy(stage_rows - 2), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(16), phy(stage_rows - 3), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(16), phy(stage_rows - 4), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(15), phy(stage_rows - 4), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(14), phy(stage_rows - 4), block_size, block_size, 'ground', true));
    // res.push(new Block(phy(18), phy(stage_rows - 2), block_size, block_size, 'ground', true));
    return res;
}

var engi = new Character(phy(13), phy(9), block_size, block_size);
var blocks = genGround();
var moving_blocks = [];

let engi_sprite = undefined;
let block_sprite = undefined;
var engi_stand_pic = [];
var engi_run_pic = [];
var engi_jump_pic = [];
var ground_pic = undefined;
var drop_pic = undefined;

function loadImage(src) {
    let p = new Promise(function (resolve, reject) {
        let img = new Image();
        img.onload = function () { //加载时执行resolve函数
            resolve(img);
        }
        img.onerror = function () {
            reject(src);
        }
        img.src = src;
    })
    return p;
}

function reverseImage(sourceData, newData) {
    // let newData = new Array();
    // for (let i = 0; i < sourceData.height; ++i) {
    //     newData[i] = new Array();
    //     for (let j = 0; j < sourceData.width; ++j) {
    //         newData[i][j] = 0;
    //     }
    // }
    for (let i = 0, h = sourceData.height; i < h; i++) {
        for (let j = 0, w = sourceData.width; j < w; j++) {
            newData.data[i * w * 4 + j * 4 + 0] =
                sourceData.data[i * w * 4 + (w - j) * 4 + 0];
            newData.data[i * w * 4 + j * 4 + 1] =
                sourceData.data[i * w * 4 + (w - j) * 4 + 1];
            newData.data[i * w * 4 + j * 4 + 2] =
                sourceData.data[i * w * 4 + (w - j) * 4 + 2];
            newData.data[i * w * 4 + j * 4 + 3] =
                sourceData.data[i * w * 4 + (w - j) * 4 + 3];
        }
    }
    return newData;
}

function splitEngiSprite(img) {
    img.crossOrigin = 'anonymous'
    context.drawImage(img, 0, 0);
    engi_stand_pic.push(context.getImageData(0, 0, block_size, block_size));
    let tmp_stand_pic = context.getImageData(0, 0, block_size, block_size);
    engi_stand_pic.push(reverseImage(engi_stand_pic[0], tmp_stand_pic));

    for (let i = 0; i < 8; ++i) {
        engi_run_pic.push(context.getImageData(block_size * i, block_size, block_size, block_size));
    }
    for (let i = 0; i < 8; ++i) {
        let tmp_pic = context.getImageData(block_size * i, block_size, block_size, block_size);
        engi_run_pic.push(reverseImage(engi_run_pic[i], tmp_pic));
    }
    // var imgData = context.getImageData(engi.x, engi.y, engi.w, engi.h);
    // var newImgData = context.getImageData(engi.x, engi.y, engi.w, engi.h);
    // context.putImageData(imageDataHRevert(imgData, newImgData), engi.x, engi.y);
    context.clearRect(0, 0, stage_cols * block_size, stage_rows * block_size);
}

function splitBlockSprite(img) {
    img.crossOrigin = 'anonymous'
    context.drawImage(img, 0, 0);
    drop_pic = context.getImageData(0, 0, block_size, block_size * 2);
    ground_pic = context.getImageData(block_size, 0, block_size, block_size);
}

async function imgAsync() {
    await loadImage(`${pic_root}/engi.png`).then(img => {
        engi_sprite = img;
    });
    await loadImage(`${pic_root}/block.png`).then(img => {
        block_sprite = img;
    });
}

async function spiltSprites() {
    splitEngiSprite(engi_sprite);
    splitBlockSprite(block_sprite);
}

function drawEngi() {
    context.fillStyle = "#FF0000";
    if (!engi.isRun() && !engi.isJump()) {
        context.putImageData(engi.dir === 0 ? engi_stand_pic[1] : engi_stand_pic[0], engi.x, engi.y);
    } else if (engi.isRun()) {
        context.putImageData(engi.dir === 0 ? engi_run_pic[(engi.run_cnt >> 1) + 8] : engi_run_pic[engi.run_cnt >> 1], engi.x, engi.y);
        engi.incrementRunCount();
    } else {
        context.putImageData(engi.dir === 0 ? engi_stand_pic[1] : engi_stand_pic[0], engi.x, engi.y);
    }
}

function drawGlobal() {
    context.clearRect(0, 0, stage_cols * block_size, stage_rows * block_size);
    context.fillStyle = "#000000";
    for (let i in blocks) {
        if (blocks[i].isDraw()) {
            // context.putImageData(engi_stand_pic, blocks[i].x, blocks[i].y);
            context.putImageData(
                blocks[i].pic === 'ground' ? ground_pic :
                    blocks[i].pic === 'drop' ? drop_pic :
                        ground_pic
                , blocks[i].x, blocks[i].y,
            );

            // context.strokeRect(blocks[i].x, blocks[i].y, blocks[i].w, blocks[i].h);
        }
    }

    for (let i = 0; i < moving_blocks.length; ++i) {
        if (moving_blocks[i].isFall()) {
            if (moving_blocks[i].isDraw()) {
                context.putImageData(drop_pic, moving_blocks[i].x, moving_blocks[i].y);
            }
        }

    }

    drawEngi();
}

var tick_cnt = 0;

function rangeRandom(a, b) {
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

function genPod() {
    moving_blocks.push(new MovingBlock(rangeRandom(0, (stage_cols * 2 - 1)) * block_size / 2, -block_size * 2 + 5, block_size, block_size * 2));
}

function tick() {
    // console.log(moving_blocks)
    for (let i = 0; i < moving_blocks.length; ++i) {
        if (moving_blocks[i].isFall()) {
            moving_blocks[i].fall();
        }
    }
    engi.act();
    drawGlobal();
    if (tick_cnt % Math.floor(1000 / render_interval * 1.5) === 0) {
        genPod();
    }
    tick_cnt++;
}

$(function () {
    $(document).keydown(function (e) {
        switch (e.keyCode) {
            case 87:
                if (!engi.isJump() && trigger_jump) {
                    engi.initJump();
                    trigger_jump = false;
                }
                break;
            case 65:
                engi.initRun(0);
                break;
            case 68:
                engi.initRun(1);
                break;
            default: break;
        }
    });
    $(document).keyup(function (e) {
        switch (e.keyCode) {
            case 87:
                trigger_jump = true;
                break;
            case 65:
                engi.stopRun(0);
                break;
            case 68:
                engi.stopRun(1);
                break;
            default: break;
        }
    });
    imgAsync().then(function () {
        spiltSprites().then(function () {
            main_timer = setInterval(function () {
                tick();
            }, render_interval);
        })
    });
});