extends Node2D
## 戰鬥場景主控腳本
## 管理戰鬥流程 UI 和回合邏輯

enum BattlePhase { PREPARE, PLAYER_TURN, ENEMY_TURN, RESOLVE, VICTORY, DEFEAT }

var phase: BattlePhase = BattlePhase.PREPARE
var party: Array[CharacterBattle] = []
var enemies: Array[EnemyBattle] = []
var selected_character_index: int = 0
var turn_count: int = 0

@onready var sp_label: Label = $UI/SPBar/SPLabel
@onready var turn_label: Label = $UI/TurnLabel
@onready var action_menu: VBoxContainer = $UI/ActionMenu
@onready var battle_log: RichTextLabel = $UI/BattleLog

func _ready() -> void:
	_setup_test_battle()
	BattleManager.sp_changed.connect(_on_sp_changed)
	BattleManager.start_battle()
	_start_player_turn()

func _setup_test_battle() -> void:
	# 測試用：建立茴 + 2個佔位角色 vs 1個低階遊靈
	var hui_data = DataManager.characters_db.get("hui", {})
	if not hui_data.is_empty():
		var hui = CharacterBattle.new()
		hui.initialize(hui_data)
		party.append(hui)
		add_child(hui)

	# 建立測試敵人
	var enemy_data = DataManager.enemies_db.get("low_spirit", {})
	if not enemy_data.is_empty():
		var enemy = EnemyBattle.new()
		enemy.initialize(enemy_data)
		enemy.enemy_died.connect(_on_enemy_died)
		enemies.append(enemy)
		add_child(enemy)

func _start_player_turn() -> void:
	phase = BattlePhase.PLAYER_TURN
	turn_count += 1
	_update_ui()
	_show_action_menu()

	# 減少技能冷卻
	for character in party:
		character.tick_cooldowns()

func _show_action_menu() -> void:
	if action_menu == null:
		return
	# 清除舊按鈕
	for child in action_menu.get_children():
		child.queue_free()

	var current_char = party[selected_character_index]

	# 普通攻擊按鈕
	var atk_btn = Button.new()
	atk_btn.text = "普通攻擊 (SP+10)"
	atk_btn.pressed.connect(_on_normal_attack)
	action_menu.add_child(atk_btn)

	# 靈技按鈕
	for skill_id in current_char.skill_cooldowns:
		var skill_data = DataManager.skills_db.get(skill_id, {})
		if skill_data.is_empty():
			continue

		var btn = Button.new()
		var cooldown = current_char.skill_cooldowns[skill_id]
		var sp_cost = skill_data.get("sp_cost", 0)

		if cooldown > 0:
			btn.text = "%s (冷卻: %d回合)" % [skill_data["name"], cooldown]
			btn.disabled = true
		elif sp_cost > BattleManager.current_sp:
			btn.text = "%s (SP不足: %d/%d)" % [skill_data["name"], BattleManager.current_sp, sp_cost]
			btn.disabled = true
		else:
			btn.text = "%s (SP-%d)" % [skill_data["name"], sp_cost]
			btn.pressed.connect(_on_use_skill.bind(skill_id))

		action_menu.add_child(btn)

func _on_normal_attack() -> void:
	if enemies.is_empty():
		return
	var current_char = party[selected_character_index]
	var target = enemies[0]  # 暫時自動選第一個敵人
	var damage = current_char.use_normal_attack(target)
	_log("【%s】普通攻擊 → %s，造成 %d 傷害" % [current_char.character_name, target.enemy_name, damage])
	_end_player_action()

func _on_use_skill(skill_id: String) -> void:
	if enemies.is_empty():
		return
	var current_char = party[selected_character_index]
	var target = enemies[0]
	var result = current_char.use_skill(skill_id, target)

	if result["success"]:
		var skill_name = DataManager.skills_db[skill_id]["name"]
		if result["damage"] > 0:
			var advantage_text = " 【弱點！】" if result.get("is_advantage", false) else ""
			_log("【%s】%s → %s，造成 %d 傷害%s" % [current_char.character_name, skill_name, target.enemy_name, result["damage"], advantage_text])
		if result.get("effect", "") == "shield":
			_log("【%s】%s → 施加護盾" % [current_char.character_name, skill_name])
	else:
		_log("技能使用失敗：%s" % result.get("reason", ""))
		return  # 不消耗回合

	_end_player_action()

func _end_player_action() -> void:
	# 檢查是否所有角色都行動完
	selected_character_index += 1
	if selected_character_index < party.size():
		_show_action_menu()
	else:
		selected_character_index = 0
		_start_enemy_turn()

func _start_enemy_turn() -> void:
	phase = BattlePhase.ENEMY_TURN
	var alive_party: Array[CharacterBattle] = []
	for c in party:
		if c.is_alive:
			alive_party.append(c)

	for enemy in enemies:
		if not enemy.is_alive:
			continue
		var result = enemy.execute_turn(alive_party)
		match result["action"]:
			"attack":
				_log("【%s】攻擊 → %s，造成 %d 傷害" % [enemy.enemy_name, result["target"], result["damage"]])
			"defend":
				_log("【%s】進入防禦姿態" % enemy.enemy_name)
			"charge":
				_log("【%s】正在蓄力..." % enemy.enemy_name)
			"stunned":
				_log("【%s】處於崩潰狀態，跳過回合！" % enemy.enemy_name)

	# 顯示敵人下回合意圖
	for enemy in enemies:
		if enemy.is_alive:
			_log("  → %s 下回合：%s" % [enemy.enemy_name, enemy.get_intent_display()])

	_check_battle_end()

func _check_battle_end() -> void:
	var all_enemies_dead = true
	for enemy in enemies:
		if enemy.is_alive:
			all_enemies_dead = false
			break

	if all_enemies_dead:
		phase = BattlePhase.VICTORY
		_log("\n🎉 戰鬥勝利！")
		BattleManager.end_battle(true)
		return

	var all_party_dead = true
	for character in party:
		if character.is_alive:
			all_party_dead = false
			break

	if all_party_dead:
		phase = BattlePhase.DEFEAT
		_log("\n💀 戰鬥失敗...")
		BattleManager.end_battle(false)
		return

	# 繼續下一回合
	_start_player_turn()

func _on_enemy_died() -> void:
	_log("敵人被擊敗！")

func _on_sp_changed(new_sp: int) -> void:
	if sp_label:
		sp_label.text = "SP: %d / %d" % [new_sp, BattleManager.SP_MAX]

func _update_ui() -> void:
	if turn_label:
		turn_label.text = "回合 %d" % turn_count
	_on_sp_changed(BattleManager.current_sp)

func _log(text: String) -> void:
	if battle_log:
		battle_log.append_text(text + "\n")
	print(text)
