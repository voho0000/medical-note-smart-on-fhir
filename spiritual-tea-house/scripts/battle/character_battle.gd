extends Node2D
class_name CharacterBattle
## 戰鬥中的角色實例
## 管理角色的 HP、技能冷卻、狀態

signal hp_changed(current_hp: int, max_hp: int)
signal character_died()
signal skill_used(skill_id: String)

@export var character_id: String = ""

var character_name: String = ""
var element: BattleManager.Element = BattleManager.Element.NONE
var max_hp: int = 0
var current_hp: int = 0
var atk: int = 0
var def_stat: int = 0
var spd: int = 0
var shield: int = 0

var skill_cooldowns: Dictionary = {}  # skill_id -> remaining cooldown
var is_alive: bool = true

# 前中後排位置
enum Position { FRONT, MIDDLE, BACK }
var position: Position = Position.FRONT

func initialize(data: Dictionary) -> void:
	character_id = data.get("id", "")
	character_name = data.get("name", "")
	element = data.get("element", BattleManager.Element.NONE)
	max_hp = data.get("base_hp", 100)
	current_hp = max_hp
	atk = data.get("base_atk", 10)
	def_stat = data.get("base_def", 10)
	spd = data.get("base_spd", 10)

	# 初始化技能冷卻
	for skill_id in data.get("skills", []):
		skill_cooldowns[skill_id] = 0
	var burst = data.get("burst", "")
	if burst != "":
		skill_cooldowns[burst] = 0

func take_damage(damage: int) -> int:
	# 先扣護盾
	if shield > 0:
		if shield >= damage:
			shield -= damage
			return 0
		else:
			damage -= shield
			shield = 0

	var actual_damage = maxi(1, damage - def_stat / 4)
	current_hp = maxi(0, current_hp - actual_damage)
	hp_changed.emit(current_hp, max_hp)

	if current_hp <= 0:
		is_alive = false
		character_died.emit()

	# 被攻擊回充 SP
	BattleManager.add_sp(BattleManager.SP_HIT_GAIN)
	return actual_damage

func heal(amount: int) -> void:
	current_hp = mini(current_hp + amount, max_hp)
	hp_changed.emit(current_hp, max_hp)

func add_shield(amount: int) -> void:
	shield += amount

func use_normal_attack(target: CharacterBattle) -> int:
	var damage = atk
	var element_mult = BattleManager.get_element_multiplier(element, target.element)
	var final_damage = int(damage * element_mult)
	var actual = target.take_damage(final_damage)
	BattleManager.add_sp(BattleManager.SP_NORMAL_ATTACK_GAIN)
	return actual

func use_skill(skill_id: String, target: CharacterBattle) -> Dictionary:
	var skill_data = DataManager.skills_db.get(skill_id, {})
	if skill_data.is_empty():
		return {"success": false, "reason": "技能不存在"}

	# 檢查冷卻
	if skill_cooldowns.get(skill_id, 0) > 0:
		return {"success": false, "reason": "技能冷卻中"}

	# 檢查 SP
	var sp_cost = skill_data.get("sp_cost", 0)
	if sp_cost > 0 and not BattleManager.use_sp(sp_cost):
		return {"success": false, "reason": "SP 不足"}

	# 計算傷害
	var result: Dictionary = {"success": true, "damage": 0, "effect": ""}
	var skill_element = skill_data.get("element", element)
	var multiplier = skill_data.get("damage_multiplier", 1.0)

	if multiplier > 0:
		var element_mult = BattleManager.get_element_multiplier(skill_element, target.element)
		var damage = int(atk * multiplier * element_mult)
		result["damage"] = target.take_damage(damage)
		result["is_advantage"] = BattleManager.is_advantage(skill_element, target.element)

	# 護盾效果
	if skill_data.get("effect", "") == "shield":
		var shield_amount = skill_data.get("shield_amount", 100)
		target.add_shield(shield_amount)
		result["effect"] = "shield"

	# 設定冷卻
	skill_cooldowns[skill_id] = skill_data.get("cooldown", 0)
	skill_used.emit(skill_id)
	return result

func tick_cooldowns() -> void:
	for skill_id in skill_cooldowns:
		if skill_cooldowns[skill_id] > 0:
			skill_cooldowns[skill_id] -= 1

func get_available_skills() -> Array:
	var available: Array = []
	for skill_id in skill_cooldowns:
		if skill_cooldowns[skill_id] <= 0:
			available.append(skill_id)
	return available
