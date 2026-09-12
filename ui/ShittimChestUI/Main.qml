import QtQuick 2.15
import QtQuick.Window 2.15
import QtQuick.Controls 2.15
import Spine 1.0

Window {
    id: root
    width: 2560
    height: 1440
    visible: true
    title: "什亭之匣"
    color: "#0a0a14"

    Rectangle {
        anchors.fill: parent
        color: "#0a0a14"

        Rectangle {
            anchors.fill: parent
            anchors.margins: 40
            color: "transparent"
            border.color: "#2a3a5a"
            border.width: 2
            opacity: 0.5
        }

        Rectangle {
            anchors.top: parent.top
            anchors.left: parent.left
            width: 120; height: 120
            color: "transparent"; border.color: "#4a8aff"; border.width: 1; opacity: 0.3
        }
        Rectangle {
            anchors.top: parent.top
            anchors.right: parent.right
            width: 120; height: 120
            color: "transparent"; border.color: "#4a8aff"; border.width: 1; opacity: 0.3
        }
        Rectangle {
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            width: 120; height: 120
            color: "transparent"; border.color: "#4a8aff"; border.width: 1; opacity: 0.3
        }
        Rectangle {
            anchors.bottom: parent.bottom
            anchors.right: parent.right
            width: 120; height: 120
            color: "transparent"; border.color: "#4a8aff"; border.width: 1; opacity: 0.3
        }
    }

    Item {
        anchors.fill: parent
        anchors.margins: 80

        Column {
            anchors.top: parent.top
            anchors.left: parent.left

            Text {
                text: "什亭之匣"
                font.family: "Microsoft YaHei"
                font.pixelSize: 48
                font.bold: true
                color: "#c8d8ff"
                opacity: 0.9
            }

            Text {
                id: clockText
                text: Qt.formatDateTime(new Date(), "yyyy-MM-dd  hh:mm:ss")
                font.family: "Microsoft YaHei"
                font.pixelSize: 24
                color: "#8899bb"
                opacity: 0.7
            }

            Timer {
                interval: 1000
                running: true
                repeat: true
                onTriggered: clockText.text = Qt.formatDateTime(new Date(), "yyyy-MM-dd  hh:mm:ss")
            }
        }

        SpineItem {
            id: spineCharacter
            anchors.centerIn: parent
            width: 800
            height: 800

            skeletonFile: "qrc:/spine/characters/plana/NP0035_spr.skel"
            atlasFile: "qrc:/spine/characters/plana/NP0035_spr.atlas"
            animation: "idle"
            scale: 0.6
        }

        Row {
            anchors.bottom: parent.bottom
            anchors.right: parent.right
            spacing: 20

            Button {
                text: "主页"
                font.pixelSize: 20
                font.family: "Microsoft YaHei"
                background: Rectangle {
                    color: "#1a2a4a"
                    border.color: "#4a8aff"
                    border.width: 1
                    radius: 8
                }
                contentItem: Text {
                    text: parent.text
                    color: "#c8d8ff"
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: console.log("主页")
            }

            Button {
                text: "队伍"
                font.pixelSize: 20
                font.family: "Microsoft YaHei"
                background: Rectangle {
                    color: "#1a2a4a"
                    border.color: "#4a8aff"
                    border.width: 1
                    radius: 8
                }
                contentItem: Text {
                    text: parent.text
                    color: "#c8d8ff"
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: console.log("队伍")
            }

            Button {
                text: "剧情"
                font.pixelSize: 20
                font.family: "Microsoft YaHei"
                background: Rectangle {
                    color: "#1a2a4a"
                    border.color: "#4a8aff"
                    border.width: 1
                    radius: 8
                }
                contentItem: Text {
                    text: parent.text
                    color: "#c8d8ff"
                    font: parent.font
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                onClicked: console.log("剧情")
            }
        }
    }
}
