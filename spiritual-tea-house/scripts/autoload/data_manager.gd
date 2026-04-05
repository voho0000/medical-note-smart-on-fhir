extends Node
## 資料管理器
## 載入角色、技能、敵人等靜態資料

var characters_db: Dictionary = {}
var skills_db: Dictionary = {}
var enemies_db: Dictionary = {}

func _ready() -> void:
	_load_initial_data()

func _load_initial_data() -> void:
	# 初始角色：茴（狐靈）
	characters_db["hui"] = {
		"id": "hui",
		"name": "茴",
		"title": "忠心狐靈",
		"element": BattleManager.Element.FIRE,
		"base_hp": 800,
		"base_atk": 120,
		"base_def": 80,
		"base_spd": 95,
		"skills": ["fox_flame", "spirit_shield"],
		"burst": "nine_tail_blaze",
		"description": "奶奶當年收留的小狐狸，嘴硬心軟。",
	}

	# 初始技能
	skills_db["normal_attack"] = {
		"id": "normal_attack",
		"name": "普通攻擊",
		"type": "normal",
		"sp_gain": BattleManager.SP_NORMAL_ATTACK_GAIN,
		"damage_multiplier": 1.0,
		"cooldown": 0,
		"description": "基礎攻擊，回充 SP +10",
	}

	skills_db["fox_flame"] = {
		"id": "fox_flame",
		"name": "狐焰",
		"type": "skill",
		"sp_cost": BattleManager.SP_SKILL_COST,
		"damage_multiplier": 2.5,
		"cooldown": BattleManager.SKILL_COOLDOWN,
		"element": BattleManager.Element.FIRE,
		"description": "釋放靈火攻擊單體敵人，附帶燃燒效果。",
	}

	skills_db["spirit_shield"] = {
		"id": "spirit_shield",
		"name": "靈狐護盾",
		"type": "skill",
		"sp_cost": BattleManager.SP_SKILL_COST,
		"damage_multiplier": 0.0,
		"cooldown": BattleManager.SKILL_COOLDOWN,
		"effect": "shield",
		"shield_amount": 200,
		"description": "為單體隊友施加護盾，吸收傷害。",
	}

	skills_db["nine_tail_blaze"] = {
		"id": "nine_tail_blaze",
		"name": "九尾烈焰",
		"type": "burst",
		"sp_cost": BattleManager.SP_BURST_COST,
		"damage_multiplier": 5.0,
		"cooldown": BattleManager.BURST_COOLDOWN,
		"element": BattleManager.Element.FIRE,
		"description": "茴的靈魂爆發，九尾齊現焚盡敵人。",
	}

	# 初始敵人
	enemies_db["low_spirit"] = {
		"id": "low_spirit",
		"name": "低階遊靈",
		"element": BattleManager.Element.WOOD,
		"hp": 500,
		"atk": 60,
		"def": 40,
		"spd": 50,
		"skills": ["spirit_claw"],
		"intent_pool": ["attack", "attack", "defend", "charge"],
		"description": "在靈界邊境遊蕩的低階靈體。",
	}
