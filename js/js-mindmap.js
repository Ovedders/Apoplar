/*
 js-mindmap
 
 Copyright (c) 2008/09/10 Kenneth Kufluk http://kenneth.kufluk.com/
 
 MIT (X11) license
  
 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.

*/
(function($){

    var TIMEOUT = 4;  // movement timeout in seconds
    var CENTRE_FORCE = 3;  // strength of attraction to the centre by the active node


    // Define all Node related functions.
    function Node(obj, name, parent, opts){
        this.obj = obj;
        this.options = obj.options;

        this.name = name;
        this.href = opts.href;
        if (opts.url) this.url = opts.url;

        this.el = $('<a href="'+this.href+'">'+this.name+'</a>');
        this.el.addClass('node');
        $('body').prepend(this.el);
        
        if (!parent) {
            obj.activeNode = this;
            $(this.el).addClass('active');
            $(this.el).addClass('root');
        } else {
            var lineno = obj.lines.length;
            obj.lines[lineno] = new Line(obj, this, parent);
        }
        this.parent = parent;
        this.children = new Array();
        if (this.parent) this.parent.children.push(this);
        this.moving = false;
        this.moveTimer = 0;
        this.obj.movementStopped = false;
        this.visible = true;
        this.hasLayout = true;
        this.x = 1;
        this.y = 1;
        this.dx = 0;
        this.dy = 0;
        this.hasPosition = false;
        
        this.content = []; // array of content elements to display onclick;
        
        this.el.css('position','absolute');        

        var thisnode = this;

        this.el.draggable({
            drag:function() {
                obj.root.animateToStatic();
            }
        });

        this.el.click(function(){
/*
            if (obj.activeNode==thisnode) {
                if (thisnode.url) location.href=thisnode.url;
                else location.href=this.href;
                return false;
            }
*/
            if (obj.activeNode) {
                obj.activeNode.el.removeClass('active');
/*
                // remove the activeNodes children
                // except, obviously, the node in question (doh!)
                var kids = obj.activeNode.children;
                var selfIsKid = false;
                for (var i=0;i<kids.length;i++) {
                    if (kids[i]===thisnode) {
                        selfIsKid = true;
                        continue;
                    }
                    kids[i].removeNode();
                }
                obj.activeNode.children = [];
                if (selfIsKid) obj.activeNode.children.push(thisnode);

                // remove MY children
                var kids = thisnode.children;
                for (var i=0;i<kids.length;i++) {
                    kids[i].removeNode();
                }
                thisnode.children = [];
*/
            }
            if (typeof(opts.onclick)=='function') opts.onclick(thisnode);
            obj.activeNode = thisnode;
            obj.activeNode.el.addClass('active');
            obj.root.animateToStatic();
            return false;
        });

    }

    // ROOT NODE ONLY:  control animation loop
    Node.prototype.animateToStatic = function() {

        clearTimeout(this.moveTimer);
        // stop the movement after a certain time
        var thisnode = this;
        this.moveTimer = setTimeout(function() {
            //stop the movement
            thisnode.obj.movementStopped = true;
        }, TIMEOUT*1000);

        if (this.moving) return;
        this.moving = true;
        this.obj.movementStopped = false;
        this.animateLoop();
    }
    
    // ROOT NODE ONLY:  animate all nodes (calls itself recursively)
    Node.prototype.animateLoop = function() {
        this.obj.canvas.clear();
        for (var i = 0; i < this.obj.lines.length; i++) {
            this.obj.lines[i].updatePosition();
        }
        if (this.findEquilibrium() || this.obj.movementStopped) {
            this.moving=false;
            return;
        }
        var mynode = this;
        setTimeout(function() {
            mynode.animateLoop();
        }, 10);
    }

    // find the right position for this node
    Node.prototype.findEquilibrium = function() {
        var static = true;
        static = this.display() && static;
        for (var i=0;i<this.children.length;i++) {
            static = this.children[i].findEquilibrium() && static;
        }
        return static;
    }

    //Display this node, and its children
    Node.prototype.display = function(depth) {
        if (typeof(depth)=='undefined') depth=0;
        this.drawn = true;
        // am I positioned?  If not, position me.
        if (!this.hasPosition) {
            this.x = this.options.mapArea.x/2;
            this.y = this.options.mapArea.y/2;
        	this.el.css('left', this.x + "px");
        	this.el.css('top', this.y + "px");
            this.hasPosition=true;
        }
        // are my children positioned?  if not, lay out my children around me
        var stepAngle = Math.PI*2/this.children.length;
        var parent = this;  
        $.each(this.children, function(index) {
            if (!this.hasPosition) {
                if (!this.options.showProgressive || depth<=1) {
                    var angle = index * stepAngle;
                    this.x = (50 * Math.cos(angle)) + parent.x;
                    this.y = (50 * Math.sin(angle)) + parent.y;
                    this.hasPosition=true;           
                	this.el.css('left', this.x + "px");
                	this.el.css('top', this.y + "px");
                }
            }
        });
        // update my position
        return this.updatePosition();
    }

    // updatePosition returns a boolean stating whether it's been static
    Node.prototype.updatePosition = function(){
        if ($(this.el).hasClass("ui-draggable-dragging")) {
    		this.x = parseInt(this.el.css('left')) + ($(this.el).width() / 2);
    		this.y = parseInt(this.el.css('top')) + ($(this.el).height() / 2);
    		this.dx = 0;
    		this.dy = 0;
    		return false;
    	}
        
        //apply accelerations
        var forces = this.getForceVector();
        this.dx += forces.x * this.options.timeperiod;
        this.dy += forces.y * this.options.timeperiod;

        // damp the forces
        this.dx = this.dx * this.options.damping;
        this.dy = this.dy * this.options.damping;

        //ADD MINIMUM SPEEDS
        if (Math.abs(this.dx) < this.options.minSpeed) this.dx = 0;
        if (Math.abs(this.dy) < this.options.minSpeed) this.dy = 0;
        if (Math.abs(this.dx)+Math.abs(this.dy)==0) return true;
        //apply velocity vector
        this.x += this.dx * this.options.timeperiod;
        this.y += this.dy * this.options.timeperiod;
        this.x = Math.min(this.options.mapArea.x,Math.max(1,this.x));
        this.y = Math.min(this.options.mapArea.y,Math.max(1,this.y));
        // display
    	var showx = this.x - ($(this.el).width() / 2);
    	var showy = this.y - ($(this.el).height() / 2) - 10;
    	this.el.css('left', showx + "px");
    	this.el.css('top', showy + "px");
    	return false;
    }

    Node.prototype.getForceVector = function(){
        var fx = 0;
        var fy = 0;
        
        var nodes = this.obj.nodes;
        var lines = this.obj.lines;
        
        // Calculate the repulsive force from every other node
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] == this) continue;
            if (this.options.showSublines && !nodes[i].hasLayout) continue;
            if (!nodes[i].visible) continue;
            // Repulsive force (coulomb's law)
            var x1 = (nodes[i].x - this.x);
            var y1 = (nodes[i].y - this.y);
            //adjust for variable node size
//		var nodewidths = (($(nodes[i]).width() + $(this.el).width())/2);
            var xsign = x1 / Math.abs(x1);
            var ysign = y1 / Math.abs(y1);
            var dist = Math.sqrt((x1 * x1) + (y1 * y1));
            var theta = Math.atan(y1 / x1);
            if (x1 == 0) {
                theta = Math.PI / 2;
                xsign = 0;
            }
            // force is based on radial distance
            var myrepulse = this.options.repulse;
//                if (this.parent==nodes[i]) myrepulse=myrepulse*10;  //parents stand further away
            var f = (myrepulse * 500) / (dist * dist);
            if (Math.abs(dist) < 500) {
                fx += -f * Math.cos(theta) * xsign;
                fy += -f * Math.sin(theta) * xsign;
            }
        }
        // add repulsive force of the "walls"
        //left wall
        var xdist = this.x + $(this.el).width();
        var f = (this.options.wallrepulse * 500) / (xdist * xdist);
        fx += Math.min(2, f);
        //right wall
        var rightdist = (this.options.mapArea.x - xdist);
        var f = -(this.options.wallrepulse * 500) / (rightdist * rightdist);
        fx += Math.max(-2, f);
        //top wall
        var f = (this.options.wallrepulse * 500) / (this.y * this.y);
        fy += Math.min(2, f);
        //bottom wall
        var bottomdist = (this.options.mapArea.y - this.y);
        var f = -(this.options.wallrepulse * 500) / (bottomdist * bottomdist);
        fy += Math.max(-2, f);

        // for each line, of which I'm a part, add an attractive force.
        for (var i = 0; i < lines.length; i++) {
            var otherend = null;
            if (lines[i].start == this) {
                otherend = lines[i].end;
            } else if (lines[i].end == this) {
                otherend = lines[i].start;
            } else continue;
            // Ignore the pull of hidden nodes
            if (!otherend.visible) continue;
            // Attractive force (hooke's law)
            var x1 = (otherend.x - this.x);
            var y1 = (otherend.y - this.y);
            var dist = Math.sqrt((x1 * x1) + (y1 * y1));
            var xsign = x1 / Math.abs(x1);
            var theta = Math.atan(y1 / x1);
            if (x1==0) {
                theta = Math.PI / 2;
                xsign = 0;
            }
            // force is based on radial distance
            var f = (this.options.attract * dist) / 10000;
            if (Math.abs(dist) > 0) {
                fx += f * Math.cos(theta) * xsign;
                fy += f * Math.sin(theta) * xsign;
            }
        }

        // if I'm active, attract me to the centre of the area
        if (this.obj.activeNode === this) {
            // Attractive force (hooke's law)
            var otherend = this.options.mapArea;
            var x1 = ((otherend.x / 2) - this.options.centreOffset - this.x);
            var y1 = ((otherend.y / 2) - this.y);
            var dist = Math.sqrt((x1 * x1) + (y1 * y1));
            var xsign = x1 / Math.abs(x1);
            var theta = Math.atan(y1 / x1);
            if (x1 == 0) {
                theta = Math.PI / 2;
                xsign = 0;
            }
            // force is based on radial distance
            var f = (0.1 * this.options.attract * dist * CENTRE_FORCE) / 1000;
            if (Math.abs(dist) > 0) {
                fx += f * Math.cos(theta) * xsign;
                fy += f * Math.sin(theta) * xsign;
            }
        }

        if (Math.abs(fx) > this.options.maxForce) fx = this.options.maxForce * (fx / Math.abs(fx));
        if (Math.abs(fy) > this.options.maxForce) fy = this.options.maxForce * (fy / Math.abs(fy));
        return {
            x: fx,
            y: fy
        };
    }

    Node.prototype.removeNode = function(){
        for (var i=0;i<this.children.length;i++) {
            this.children[i].removeNode();
        }
    
        var oldnodes = this.obj.nodes;
        this.obj.nodes = new Array();
        for (var i = 0; i < oldnodes.length; i++) {
            if (oldnodes[i]===this) continue;
            this.obj.nodes.push(oldnodes[i]);
        }

        var oldlines = this.obj.lines;
        this.obj.lines = new Array();
        for (var i = 0; i < oldlines.length; i++) {
            if (oldlines[i].start == this) {
                continue;
            } else if (oldlines[i].end == this) {
                continue;
            } else this.obj.lines.push(oldlines[i]);
        }

        $(this.el).remove();
    }



    // Define all Line related functions.
    function Line(obj, startNode, finNode){
        this.obj = obj;
        this.options = obj.options;
        this.start = startNode;
        this.colour = "blue";
        this.size = "thick";
        this.end = finNode;
    }

    Line.prototype.updatePosition = function(){
        if (this.options.showSublines && (!this.start.hasLayout || !this.end.hasLayout)) return;
        if (!this.options.showSublines && (!this.start.visible || !this.end.visible)) return;
        if (this.start.visible && this.end.visible) this.size = "thick";
        else this.size = "thin";
        if (this.obj.activeNode.parent == this.start || this.obj.activeNode.parent == this.end) this.colour = "red";
        else this.colour = "blue";
        this.strokeStyle = "#FFF";
        switch (this.colour) {
            case "red":
//                    this.strokeStyle = "rgba(50, 50, 50, 0.6)";
                break;
            case "blue":
//                    this.strokeStyle = "rgba(10, 10, 10, 0.2)";
                break;
        }
        switch (this.size) {
            case "thick":
//                    this.obj.ctx.lineWidth = "3";
                break;
            case "thin":
//                    this.obj.ctx.lineWidth = "1";
                break;
        }

        var c = this.obj.canvas.path("M"+this.start.x+' '+this.start.y+"L"+this.end.x+' '+this.end.y).attr({stroke: this.strokeStyle, opacity:0.2, 'stroke-width':'5px'});                

    }
    
    $.fn.addNode = function (parent, name, options) {
        var obj = this[0];
        var node = obj.nodes[obj.nodes.length] = new Node(obj, name, parent, options);
        obj.animateToStatic();
        return node;
    }

    $.fn.addRootNode = function (name, opts) {
        var node = this[0].nodes[0] = new Node(this[0], name, null, opts);
        this[0].root = node;
        return node;
    }
    
    $.fn.removeNode = function (name) {
        return this.each(function() {
//            if (!!this.mindmapInit) return false;
            //remove a node matching the anme
//            alert(name+' removed');
        });
    }
    
    $.fn.mindmap = function(options) {
        // Define default settings.
        var options = $.extend({
            attract: 6,
            repulse: 6,
            damping: 0.55,
            timeperiod: 10,
            wallrepulse: 0.4,
            mapArea: {
                x:-1,
                y:-1
            },
            canvasError: 'alert',
            minSpeed: 0.05,
            maxForce: 0.1,
            showSublines: true,
            updateIterationCount: 20,
            showProgressive: true,
            centreOffset:100,
            timer: 0
        },options);
    

        // Main Running Loop
        /*
        var Loop = function (obj){
            var nodes = obj.nodes;
            var lines = obj.lines;
            
            var changed = false;
            
            $.each(nodes, function() {
                this.drawn=false;
            });
            obj.canvas.clear();
            //obj.activeNode.display();
            
            // TODO.  This is a horribly procedural way to do this.
            // KPK:  Not necessarily.  See attempt using .display above, which proved that the circular nature of the hierarchy does not lend itself to recursion.
            //update node positions
            for (var i = 0; i < nodes.length; i++) {
                //TODO: replace this temporary idea
                var childActive = false;
                var currentNode = obj.activeNode;
                while (currentNode.parent && (currentNode = currentNode.parent)) {
                    if (currentNode == nodes[i]) childActive = true;
                }
                if (childActive || obj.activeNode == nodes[i] || obj.activeNode == nodes[i].parent) {
                    nodes[i].visible = true;
                    nodes[i].hasLayout = true;
                } else {
                    nodes[i].visible = false;
                    if (nodes[i].parent && nodes[i].parent.parent && nodes[i].parent.parent == obj.activeNode) {
                        nodes[i].hasLayout = true;
                    } else {
                        nodes[i].hasLayout = false;
                    }
                    if (!options.showProgressive) {
                        nodes[i].visible = true;
                        nodes[i].hasLayout = true;
                    }
                }
                if (nodes[i].visible) {
                    nodes[i].el.show();
                } else {
                    nodes[i].el.hide();
                }
                if ((options.showSublines && !nodes[i].hasLayout) || (!options.showSublines && !nodes[i].visible)) continue;
                nodes[i].display();
            }
            
            //display lines
            for (var i = 0; i < lines.length; i++) {
                lines[i].updatePosition();
            }
            // has anything changed?
            // if not, clear the loop
        }
        */

        return this.each(function() {
            var mindmap = this;
            this.mindmapInit = true;
            this.nodes = new Array();
            this.lines = new Array();
            this.activeNode = null;
            this.options = options;
            this.animateToStatic = function() {
                this.root.animateToStatic();
            }
            $(window).resize(function(){
                mindmap.animateToStatic();
            });
        
            //canvas
            if (options.mapArea.x==-1) {
                options.mapArea.x = $(window).width();
            }
            if (options.mapArea.y==-1) {
                options.mapArea.y = $(window).height();
            }
            //create drawing area
            this.canvas = Raphael(0, 0, options.mapArea.x, options.mapArea.y);
            
            // Add a class to the object, so that styles can be applied
            $(this).addClass('js-mindmap-active');
            
        });
    };
})(jQuery);
